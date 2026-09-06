import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AdminPendingConnection, OnboardingProgressPatch } from "@kidan/contracts";
import { buildApp } from "../../src/appFactory.js";
import { AdminService, PILOT_ADMIN_ID } from "../../src/admin/adminService.js";
import { SessionAccessError, SessionService } from "../../src/auth/sessionService.js";
import { OnboardingService } from "../../src/onboarding/onboardingService.js";
import { DiscoveryService } from "../../src/discovery/discoveryService.js";
import { ConnectionService } from "../../src/connections/connectionService.js";
import { PostgresPersistenceRepository } from "../../src/persistence/postgresRepository.js";
import type { UserRecord } from "../../src/persistence/types.js";
import { IdentityCipher, SecretHasher } from "../../src/security/crypto.js";
import { generatePublicCode } from "../../src/security/publicCode.js";
import { createIntegrationHarness, type IntegrationHarness } from "./harness.js";

const encryptionKey = randomBytes(32);
const lookupKey = randomBytes(32);
const sessionKey = randomBytes(32);

interface ConsentAll {
  informationAccurate: true; identityProcessing: true; faithDataProcessing: true;
  discoveryPublication: true; verificationPhotoRetention: true; communityRules: true;
  botNotifications: boolean;
}

const consentAll: ConsentAll = {
  informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
  discoveryPublication: true, verificationPhotoRetention: true, communityRules: true,
  botNotifications: false,
};

function makePatch(
  wantsChildren: "yes" | "no" | "open_to_discussion" = "yes",
  gender: "female" | "male" = "female",
): OnboardingProgressPatch {
  return {
    schemaVersion: "2026-08-12.v1",
    expectedVersion: 0,
    currentStep: "public_preview",
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      publicProfile: {
        gender, countryCode: "ET", city: "Addis Ababa", educationLevel: "bachelors",
        fieldOfStudy: "Public health", employmentStatus: "employed", occupationCategory: "Healthcare",
        maritalStatus: "never_married", hasChildren: false, heightCm: 165,
      },
      faithAndFamily: {
        faithTradition: "ethiopian_orthodox_tewahedo", marriageIntention: "teklil",
        wantsChildren, values: ["active_faith", "honesty", "family_oriented"],
        bio: "Synthetic information used for PostgreSQL integration testing.",
      },
      partnerPreferences: {
        ageMin: 28, ageMax: 36, preferredCities: ["Addis Ababa"], openToAbroad: false,
        acceptedMaritalStatuses: ["never_married"], acceptsPartnerWithChildren: false,
        desiredValues: ["active_faith"], acceptedMarriageIntentions: ["teklil"], additionalPreferences: "",
      },
    },
  };
}

interface Services {
  repository: PostgresPersistenceRepository;
  cipher: IdentityCipher;
  sessions: SessionService;
  onboarding: OnboardingService;
}

let harness: IntegrationHarness;
let services: Services;
let app: FastifyInstance | undefined;
let nextTelegramId = 900_719_925_474_000n;
let phoneCounter = 0;

/** Returns a unique, syntactically valid Ethiopian E.164 number per call. */
function uniquePhone(): string {
  phoneCounter += 1;
  return `+2519${(10_000_000 + phoneCounter).toString().padStart(8, "0")}`;
}

function makeServices(real = true): Services {
  const repository = new PostgresPersistenceRepository(harness.pool);
  const cipher = new IdentityCipher(encryptionKey, lookupKey);
  const sessions = new SessionService(repository, cipher, new SecretHasher(sessionKey));
  return { repository, cipher, sessions, onboarding: new OnboardingService(repository, cipher, real) };
}

async function newUser(servicesToUse: Services): Promise<UserRecord> {
  const telegramId = nextTelegramId++;
  const issued = await servicesToUse.sessions.issueForTelegramUser(telegramId, new Date());
  const session = await servicesToUse.sessions.authenticate(issued.sessionToken);
  if (!session) throw new Error("session creation failed");
  return session.user;
}

async function completeSubmission(
  user: UserRecord,
  want: "yes" | "no" | "open_to_discussion" = "yes",
  gender: "female" | "male" = "female",
): Promise<void> {
  const draft = await services.onboarding.saveProgress(user.id, makePatch(want, gender));
  await services.onboarding.savePrivateIdentity(user.id, {
    fullName: "Demo Candidate", dateOfBirth: "1996-01-01", phoneNumber: uniquePhone(),
  });
  await services.onboarding.saveVerificationPhoto(user.id, { dataUrl: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}` });
  await services.onboarding.submit(user.id, { expectedVersion: draft.version, consent: consentAll });
}

beforeAll(async () => {
  harness = await createIntegrationHarness();
  services = makeServices();
});

afterAll(async () => {
  await app?.close();
  await harness?.cleanup();
});

describe("PostgreSQL repository integration", () => {
  it("creates a single app_user and identity mapping under concurrent first login", async () => {
    const telegramId = nextTelegramId++;
    const telegramHash = services.cipher.lookupHash(`telegram:${telegramId.toString()}`);
    const attempts = 8;
    const results = await Promise.all(Array.from({ length: attempts }, () =>
      services.repository.findOrCreateUserByTelegram({
        telegramLookupHash: telegramHash,
        telegramCiphertext: services.cipher.encrypt(telegramId.toString(), "telegram-id"),
        createPublicCode: () => "KD-234567",
      }),
    ));
    expect(new Set(results.map((user) => user.id)).size).toBe(1);

    const mapping = await harness.pool.query<{ user_count: string }>(`
      SELECT count(*) AS user_count
      FROM app_user u
      JOIN identity_vault i ON i.user_id = u.id
      WHERE i.telegram_id_lookup_hash = $1
    `, [telegramHash]);
    expect(mapping.rows[0]?.user_count).toBe("1");
  });

  it("retries a public-code collision without leaving orphan users", async () => {
    const codeA = generatePublicCode();
    let codeB = generatePublicCode();
    while (codeB === codeA) codeB = generatePublicCode();
    const hashA = services.cipher.lookupHash("telegram:col-a");
    await services.repository.findOrCreateUserByTelegram({
      telegramLookupHash: hashA,
      telegramCiphertext: services.cipher.encrypt("col-a", "telegram-id"),
      createPublicCode: () => codeA,
    });

    const hashB = services.cipher.lookupHash("telegram:col-b");
    const userB = await services.repository.findOrCreateUserByTelegram({
      telegramLookupHash: hashB,
      telegramCiphertext: services.cipher.encrypt("col-b", "telegram-id"),
      createPublicCode: (() => {
        let calls = 0;
        return () => { calls += 1; return calls === 1 ? codeA : codeB; };
      })(),
    });
    expect(userB.publicCode).toBe(codeB);

    const orphaned = await harness.pool.query<{ count: string }>(`
      SELECT count(*) AS count
      FROM app_user u
      LEFT JOIN identity_vault i ON i.user_id = u.id
      WHERE i.user_id IS NULL
    `);
    expect(orphaned.rows[0]?.count).toBe("0");
  });

  it("stores Telegram IDs only as ciphertext and a keyed lookup hash", async () => {
    const telegramId = nextTelegramId++;
    const issued = await services.sessions.issueForTelegramUser(telegramId, new Date());
    const session = await services.sessions.authenticate(issued.sessionToken);
    if (!session) throw new Error("session creation failed");
    const user = session.user;
    const row = (await harness.pool.query<{
      telegram_id_ciphertext: Buffer; telegram_id_lookup_hash: Buffer;
    }>("SELECT telegram_id_ciphertext, telegram_id_lookup_hash FROM identity_vault WHERE user_id = $1", [user.id])).rows[0];
    expect(row).toBeDefined();
    const plain = Buffer.from(telegramId.toString(), "utf8");
    expect(row!.telegram_id_ciphertext.equals(plain)).toBe(false);
    expect(row!.telegram_id_lookup_hash.equals(plain)).toBe(false);
    expect(row!.telegram_id_lookup_hash.length).toBe(32);
  });

  it("never stores raw session or CSRF tokens", async () => {
    const issued = await services.sessions.issueForTelegramUser(nextTelegramId++, new Date());
    const stored = await harness.pool.query<{ token_hash: Buffer; csrf_token_hash: Buffer }>(
      "SELECT token_hash, csrf_token_hash FROM app_session",
    );
    const rawToken = Buffer.from(issued.sessionToken, "utf8");
    const rawCsrf = Buffer.from(issued.csrfToken, "utf8");
    expect(stored.rows.length).toBeGreaterThan(0);
    for (const record of stored.rows) {
      expect(record.token_hash.length).toBe(32);
      expect(record.csrf_token_hash.length).toBe(32);
      expect(record.token_hash.equals(rawToken)).toBe(false);
      expect(record.csrf_token_hash.equals(rawCsrf)).toBe(false);
    }
  });

  it("authenticates active sessions and rejects revoked ones", async () => {
    const issued = await services.sessions.issueForTelegramUser(nextTelegramId++, new Date());
    expect(await services.sessions.authenticate(issued.sessionToken)).not.toBeNull();

    await services.sessions.revoke(issued.sessionToken);
    expect(await services.sessions.authenticate(issued.sessionToken)).toBeNull();
  });

  it("restores a stable CSRF token and verifies it for an active session", async () => {
    const issued = await services.sessions.issueForTelegramUser(nextTelegramId++, new Date());
    const first = await services.sessions.restoreSession(issued.sessionToken);
    const second = await services.sessions.restoreSession(issued.sessionToken);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.csrfToken).toBe(first!.csrfToken);
    const session = await services.sessions.authenticate(issued.sessionToken);
    expect(session).not.toBeNull();
    expect(services.sessions.verifyCsrf(session!, second!.csrfToken)).toBe(true);
  });

  it("does not yield a usable CSRF token for a revoked or expired session", async () => {
    const issued = await services.sessions.issueForTelegramUser(nextTelegramId++, new Date());
    expect(await services.sessions.restoreSession(issued.sessionToken)).not.toBeNull();
    await services.sessions.revoke(issued.sessionToken);
    expect(await services.sessions.restoreSession(issued.sessionToken)).toBeNull();

    const expired = await services.sessions.issueForTelegramUser(nextTelegramId++, new Date("2026-08-12T10:00:00Z"));
    const afterExpiry = new Date(expired.expiresAt.getTime() + 1_000);
    expect(await services.sessions.restoreSession(expired.sessionToken, afterExpiry)).toBeNull();
  });

  it("rejects expired sessions independently of revocation", async () => {
    const issued = await services.sessions.issueForTelegramUser(nextTelegramId++, new Date());
    expect(await services.sessions.authenticate(issued.sessionToken)).not.toBeNull();

    const afterExpiry = new Date(issued.expiresAt.getTime() + 1_000);
    expect(await services.sessions.authenticate(issued.sessionToken, afterExpiry)).toBeNull();
  });

  it("denies suspended users new and continuing sessions", async () => {
    const telegramId = nextTelegramId++;
    const issued = await services.sessions.issueForTelegramUser(telegramId, new Date());
    const session = await services.sessions.authenticate(issued.sessionToken);
    if (!session) throw new Error("expected active session");

    await harness.pool.query("UPDATE app_user SET status = 'suspended' WHERE id = $1", [session.user.id]);
    await expect(services.sessions.issueForTelegramUser(telegramId, new Date())).rejects.toThrow(SessionAccessError);
    expect(await services.sessions.authenticate(issued.sessionToken)).toBeNull();
  });

  it("denies deleted users new and continuing sessions", async () => {
    const telegramId = nextTelegramId++;
    const issued = await services.sessions.issueForTelegramUser(telegramId, new Date());
    const session = await services.sessions.authenticate(issued.sessionToken);
    if (!session) throw new Error("expected active session");

    await harness.pool.query("UPDATE app_user SET status = 'deleted' WHERE id = $1", [session.user.id]);
    await expect(services.sessions.issueForTelegramUser(telegramId, new Date())).rejects.toThrow(SessionAccessError);
    expect(await services.sessions.authenticate(issued.sessionToken)).toBeNull();
  });

  it("isolates onboarding drafts between users through routes", async () => {
    const isolated = makeServices(false);
    const sessions = isolated.sessions;
    app = await buildApp({ sessionService: sessions, onboardingService: isolated.onboarding });
    const userA = await sessions.issueForTelegramUser(400_100n, new Date());
    const userB = await sessions.issueForTelegramUser(400_200n, new Date());

    await app.inject({
      method: "PUT", url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${userA.sessionToken}`, "x-csrf-token": userA.csrfToken },
      payload: makePatch("yes"),
    });
    const other = await app.inject({
      method: "GET", url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${userB.sessionToken}` },
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().data).toMatchObject({ version: 0, payload: {} });

    const owner = await app.inject({
      method: "GET", url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${userA.sessionToken}` },
    });
    expect(owner.json().data.version).toBe(1);
  });

  it("starts drafts at version 1 and blocks stale writes without overwrite", async () => {
    const user = await newUser(services);
    const first = await services.repository.saveDraft({
      userId: user.id, schemaVersion: "2026-08-12.v1", currentStep: "eligibility",
      publicPayload: { eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true } },
      expectedVersion: 0, now: new Date(),
    });
    expect(first.version).toBe(1);

    await expect(services.repository.saveDraft({
      userId: user.id, schemaVersion: "2026-08-12.v1", currentStep: "eligibility",
      publicPayload: { eligibility: { adultConfirmed: false, eotcConfirmed: true, marriageIntentConfirmed: true } },
      expectedVersion: 0, now: new Date(),
    })).rejects.toThrow("DRAFT_VERSION_CONFLICT");

    const reloaded = await services.repository.getDraft(user.id);
    expect(reloaded?.publicPayload).toMatchObject({ eligibility: { adultConfirmed: true } });
  });

  it("locks submitted drafts against further edits including identity", async () => {
    const user = await newUser(services);
    await completeSubmission(user, "yes");
    const submitted = await services.repository.getDraft(user.id);
    expect(submitted?.submittedAt).not.toBeNull();

    await expect(services.onboarding.saveProgress(user.id, makePatch("yes"))).rejects.toThrow("DRAFT_ALREADY_SUBMITTED");
    await expect(services.onboarding.savePrivateIdentity(user.id, {
      fullName: "Changed Later", dateOfBirth: "1990-01-01", phoneNumber: uniquePhone(),
    })).rejects.toThrow("DRAFT_ALREADY_SUBMITTED");
  });

  it("rolls back all writes when a submission fails mid-transaction", async () => {
    const user = await newUser(services);
    await services.onboarding.saveProgress(user.id, makePatch("yes"));
    await services.onboarding.savePrivateIdentity(user.id, {
      fullName: "Demo Candidate", dateOfBirth: "1996-01-01", phoneNumber: uniquePhone(),
    });

    await expect(services.repository.submitOnboarding({
      userId: user.id, expectedVersion: 1,
      consents: [{ purpose: "x".repeat(81), policyVersion: "2026-08-12.v1", granted: true }],
      now: new Date(),
    })).rejects.toThrow();

    const profile = await harness.pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM discovery_profile WHERE user_id = $1", [user.id]);
    const preference = await harness.pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM partner_preference WHERE user_id = $1", [user.id]);
    const consents = await harness.pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM consent_receipt WHERE user_id = $1", [user.id]);
    expect(profile.rows[0]?.count).toBe("0");
    expect(preference.rows[0]?.count).toBe("0");
    expect(consents.rows[0]?.count).toBe("0");

    const status = (await harness.pool.query<{ status: UserRecord["status"] }>(
      "SELECT status FROM app_user WHERE id = $1", [user.id])).rows[0];
    expect(status?.status).toBe("identity_pending");
  });

  it("creates pending discovery and preference data but never an active user", async () => {
    const user = await newUser(services);
    await completeSubmission(user, "yes");

    const profile = (await harness.pool.query<{ review_status: string; profile_version: number }>(
      "SELECT review_status, profile_version FROM discovery_profile WHERE user_id = $1", [user.id])).rows[0];
    expect(profile?.review_status).toBe("pending");
    expect(profile?.profile_version).toBe(1);

    const preference = (await harness.pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM partner_preference WHERE user_id = $1", [user.id])).rows[0];
    expect(preference?.count).toBe("1");

    const active = await harness.pool.query<{ count: string }>(
      "SELECT count(*) AS count FROM app_user WHERE id = $1 AND status = 'active'", [user.id]);
    expect(active.rows[0]?.count).toBe("0");

    const pendingStatus = (await harness.pool.query<{ status: string }>(
      "SELECT status FROM app_user WHERE id = $1", [user.id])).rows[0];
    expect(pendingStatus?.status).toBe("profile_pending");
  });

  it("records consent receipts with purpose, policy version, and time", async () => {
    const user = await newUser(services);
    await completeSubmission(user, "yes");
    const receipts = await harness.pool.query<{ purpose: string; policy_version: string; granted: boolean; recorded_at: Date }>(
      "SELECT purpose, policy_version, granted, recorded_at FROM consent_receipt WHERE user_id = $1 ORDER BY purpose",
      [user.id],
    );
    const purposes = new Set(receipts.rows.map((row) => row.purpose));
    expect(purposes).toEqual(new Set(Object.keys(consentAll)));
    for (const receipt of receipts.rows) {
      expect(receipt.policy_version).toBe("2026-08-12.v1");
      expect(isNaN(receipt.recorded_at.getTime())).toBe(false);
    }
  });

  it("binds identity ciphertext to its field and user context", async () => {
    const user = await newUser(services);
    await services.onboarding.savePrivateIdentity(user.id, {
      fullName: "Context Bound", dateOfBirth: "1996-01-01", phoneNumber: uniquePhone(),
    });
    const stored = (await harness.pool.query<{ legal_name_ciphertext: Buffer }>(
      "SELECT legal_name_ciphertext FROM identity_vault WHERE user_id = $1", [user.id])).rows[0];
    if (!stored) throw new Error("identity ciphertext missing");

    expect(() => services.cipher.decrypt(stored.legal_name_ciphertext, `${user.id}:legal-name`)).not.toThrow();
    expect(services.cipher.decrypt(stored.legal_name_ciphertext, `${user.id}:legal-name`)).toBe("Context Bound");
    expect(() => services.cipher.decrypt(stored.legal_name_ciphertext, "other-user:legal-name")).toThrow();
  });

  it("keeps private identity out of onboarding_draft and discovery_profile", async () => {
    const user = await newUser(services);
    await completeSubmission(user, "yes");
    const draft = (await harness.pool.query<{ public_payload_json: unknown }>(
      "SELECT public_payload_json FROM onboarding_draft WHERE user_id = $1", [user.id])).rows[0];
    const serializedDraft = JSON.stringify(draft?.public_payload_json);
    expect(serializedDraft).not.toContain("Demo Candidate");
    expect(serializedDraft).not.toContain("+251900000000");
    expect(serializedDraft).not.toContain("1996-01-01");

    const profileColumns = await harness.pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'discovery_profile'
    `);
    const columnNames = profileColumns.rows.map((row) => row.column_name);
    expect(columnNames).not.toContain("legal_name");
    expect(columnNames).not.toContain("phone_number");
    expect(columnNames).not.toContain("date_of_birth");
  });

  it("round-trips tri-state wantsChildren values", async () => {
    for (const want of ["yes", "no", "open_to_discussion"] as const) {
      const user = await newUser(services);
      await completeSubmission(user, want);
      const stored = (await harness.pool.query<{ wants_children: string }>(
        "SELECT wants_children FROM discovery_profile WHERE user_id = $1", [user.id])).rows[0];
      expect(stored?.wants_children).toBe(want);
    }
  });

  it("reports readiness against a live PostgreSQL connection", async () => {
    const appReady = await buildApp({ readinessCheck: async () => { await harness.pool.query("SELECT 1"); } });
    const response = await appReady.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("ready");
    await appReady.close();
  });

  it("stores the verification photo as ciphertext and purges it after the retention window", async () => {
    const user = await newUser(services);
    const dataUrl = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x4a, 0x46, 0xff, 0xd9]).toString("base64")}`;
    await services.onboarding.saveVerificationPhoto(user.id, { dataUrl: dataUrl });

    // Database holds only ciphertext.
    const raw = await harness.pool.query<{ photo_ciphertext: Buffer }>(
      "SELECT photo_ciphertext FROM verification_photo WHERE user_id = $1",
      [user.id],
    );
    expect(raw.rowCount).toBe(1);
    expect(raw.rows[0]!.photo_ciphertext.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);

    // Admin retrieval round-trips the original bytes.
    const admin = await services.onboarding.getVerificationPhotoForAdmin(user.id);
    expect(admin?.mediaType).toBe("image/jpeg");
    expect(admin?.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    // Not due before approval.
    expect(await services.onboarding.purgeExpiredVerificationPhotos(new Date("2030-01-01T00:00:00Z"))).toHaveLength(0);

    // Mark approved 31 days ago, then purge.
    await harness.pool.query("UPDATE verification_photo SET approved_at = $2 WHERE user_id = $1", [
      user.id,
      new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    ]);
    const purged = await services.onboarding.purgeExpiredVerificationPhotos(new Date());
    expect(purged).toContain(user.id);
    expect(await services.onboarding.hasVerificationPhoto(user.id)).toBe(false);
  });

  describe("admin review console (B3)", () => {
    function admin(): AdminService {
      return new AdminService(services.repository, services.cipher);
    }

    it("queues a submitted candidate and decrypts the full detail + photo", async () => {
      const user = await newUser(services);
      await completeSubmission(user);
      const console_ = admin();

      const queue = await console_.listQueue();
      const mine = queue.find((item) => item.publicCode === user.publicCode);
      expect(mine).toBeDefined();
      expect(mine!.hasPhoto).toBe(true);
      expect(mine!.reviewStatus).toBe("pending");
      // Queue never carries identity.
      expect(JSON.stringify(mine)).not.toContain("Demo Candidate");

      const detail = await console_.getSubmission(user.publicCode);
      expect(detail).not.toBeNull();
      expect(detail!.identity.fullName).toBe("Demo Candidate");
      expect(detail!.identity.dateOfBirth).toBe("1996-01-01");
      expect(detail!.reviewStatus).toBe("pending");

      const photo = await console_.getPhoto(user.publicCode);
      expect(photo?.mediaType).toBe("image/jpeg");
      expect(photo!.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    });

    it("approve activates the user, starts the photo clock, and leaves the queue", async () => {
      const user = await newUser(services);
      await completeSubmission(user);
      const console_ = admin();

      const decision = await console_.decide(user.publicCode, { decision: "approved" }, new Date("2026-09-01T09:00:00Z"));
      expect(decision).toBe("approved");

      const queue = await console_.listQueue();
      expect(queue.find((i) => i.publicCode === user.publicCode)).toBeUndefined();

      // User active; profile approved; photo approved_at stamped.
      const status = await harness.pool.query<{ status: string; review_status: string }>(`
        SELECT u.status, p.review_status::text AS review_status
        FROM app_user u JOIN discovery_profile p ON p.user_id = u.id WHERE u.id = $1
      `, [user.id]);
      expect(status.rows[0]!.status).toBe("active");
      expect(status.rows[0]!.review_status).toBe("approved");

      const approvedAt = await harness.pool.query<{ approved_at: Date | null }>(
        "SELECT approved_at FROM verification_photo WHERE user_id = $1", [user.id]);
      expect(approvedAt.rows[0]!.approved_at).not.toBeNull();

      // Audit row references the seeded pilot admin.
      const audit = await harness.pool.query<{ admin_id: string; decision: string }>(
        "SELECT admin_id, decision::text AS decision FROM admin_review WHERE subject_type='profile' AND subject_id=$1",
        [user.id]);
      expect(audit.rows[0]!.admin_id).toBe(PILOT_ADMIN_ID);
      expect(audit.rows[0]!.decision).toBe("approved");
    });

    it("rejects without feedback, then rejects with feedback and suspends", async () => {
      const user = await newUser(services);
      await completeSubmission(user);
      const console_ = admin();

      await expect(console_.decide(user.publicCode, { decision: "rejected" })).rejects.toThrow("FEEDBACK_REQUIRED");

      await console_.decide(user.publicCode, {
        decision: "rejected", reasonCode: "ineligible", note: "Does not meet pilot eligibility.",
      });
      const detail = await console_.getSubmission(user.publicCode);
      expect(detail!.status).toBe("suspended");
      expect(detail!.reviewStatus).toBe("rejected");
      expect(detail!.history[0]!.note).toBe("Does not meet pilot eligibility.");

      // Note is ciphertext at rest.
      const raw = await harness.pool.query<{ note_ciphertext: Buffer | null }>(
        "SELECT note_ciphertext FROM admin_review WHERE subject_type='profile' AND subject_id=$1 ORDER BY created_at DESC LIMIT 1",
        [user.id]);
      expect(raw.rows[0]!.note_ciphertext).not.toBeNull();
      expect(raw.rows[0]!.note_ciphertext!.includes(Buffer.from("eligibility"))).toBe(false);
    });

    it("exposes the candidate's own review status (B4) and Telegram id for notifications", async () => {
      const user = await newUser(services);
      await completeSubmission(user);
      const console_ = admin();

      // Before a decision: pending, no note.
      const before = await services.onboarding.getCandidateReviewStatus(user.id);
      expect(before.status).toBe("pending");
      expect(before.feedbackNote).toBeNull();

      // Request changes; the candidate sees the note.
      await console_.decide(user.publicCode, { decision: "changes_requested", note: "Please expand your bio." });
      const waiting = await services.onboarding.getCandidateReviewStatus(user.id);
      expect(waiting.status).toBe("changes_requested");
      expect(waiting.feedbackNote).toBe("Please expand your bio.");

      // The Telegram id decrypts back to the candidate (for the safe notification).
      const ciphertext = await services.repository.getCandidateTelegramIdCiphertext(user.id);
      expect(ciphertext).not.toBeNull();
      // Identity cipher uses context "telegram-id".
      const telegramId = services.cipher.decrypt(ciphertext!, "telegram-id");
      expect(/^\d+$/.test(telegramId)).toBe(true);
    });

    it("self-serve delete removes the user and all personal data (B6)", async () => {
      const user = await newUser(services);
      await completeSubmission(user);
      const console_ = admin();
      await console_.decide(user.publicCode, { decision: "approved" });

      const deleted = await services.repository.deleteAccount(user.id, new Date());
      expect(deleted).toBe(true);

      // app_user and every cascading personal row are gone.
      const users = await harness.pool.query("SELECT 1 FROM app_user WHERE id = $1", [user.id]);
      expect(users.rowCount).toBe(0);
      for (const table of ["identity_vault", "discovery_profile", "onboarding_draft", "verification_photo", "app_session", "consent_receipt", "profile_review"]) {
        const r = await harness.pool.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [user.id]);
        expect(r.rowCount, table).toBe(0);
      }
      // Profile audit rows for this subject are also removed.
      const reviews = await harness.pool.query(
        "SELECT 1 FROM admin_review WHERE subject_type='profile' AND subject_id = $1",
        [user.id],
      );
      expect(reviews.rowCount).toBe(0);

      // A second delete reports nothing to delete.
      expect(await services.repository.deleteAccount(user.id, new Date())).toBe(false);
    });

    it("self-serve export round-trips the candidate's own identity and photo (B6)", async () => {
      const user = await newUser(services);
      await completeSubmission(user);
      const bundle = await services.onboarding.exportData(user.id, user.publicCode);
      expect(bundle.publicCode).toBe(user.publicCode);
      expect(bundle.identity?.fullName).toBe("Demo Candidate");
      expect(bundle.verificationPhoto).not.toBeNull();
      expect(Array.from(Buffer.from(bundle.verificationPhoto!.dataUrl.split(",")[1]!, "base64").subarray(0, 3)))
        .toEqual([0xff, 0xd8, 0xff]);
      expect(bundle.consents.length).toBeGreaterThanOrEqual(6);
    });

    it("changes_requested reopens the draft; resubmission returns to queue with history", async () => {
      const user = await newUser(services);
      await completeSubmission(user);
      const console_ = admin();

      await console_.decide(user.publicCode, { decision: "changes_requested", note: "Please fix your bio." });

      const reopened = await harness.pool.query<{ submitted_at: Date | null; current_step: string }>(
        "SELECT submitted_at, current_step FROM onboarding_draft WHERE user_id = $1", [user.id]);
      expect(reopened.rows[0]!.submitted_at).toBeNull();
      expect(reopened.rows[0]!.current_step).toBe("public_preview");
      // While reopened, the detail view is not available (draft not submitted).
      expect(await console_.getSubmission(user.publicCode)).toBeNull();

      // Candidate resubmits.
      const draft = await services.repository.getDraft(user.id);
      await services.repository.submitOnboarding({
        userId: user.id, expectedVersion: draft!.version,
        consents: [], now: new Date("2026-09-02T09:00:00Z"),
      });
      const detail = await console_.getSubmission(user.publicCode);
      expect(detail).not.toBeNull();
      expect(detail!.reviewStatus).toBe("pending");
      expect(detail!.history[0]!.note).toBe("Please fix your bio.");
      const queue = await console_.listQueue();
      expect(queue.find((i) => i.publicCode === user.publicCode)).toBeDefined();
    });
  });

  describe("values-only discovery (Track C)", () => {
    function discovery(): DiscoveryService {
      return new DiscoveryService(services.repository, services.cipher, true);
    }
    function adminConsole(): AdminService {
      return new AdminService(services.repository, services.cipher);
    }

    it("lists only approved opposite-gender candidates and hides decided ones", async () => {
      const feed = discovery();
      // Male actor (approved), an approved woman, an approved man, a pending woman.
      const male = await newUser(services);
      const console_ = adminConsole();
      await completeSubmission(male, "yes", "male");
      await console_.decide(male.publicCode, { decision: "approved" });

      const woman = await newUser(services);
      await completeSubmission(woman, "yes", "female");
      await console_.decide(woman.publicCode, { decision: "approved" });

      const otherMan = await newUser(services);
      await completeSubmission(otherMan, "yes", "male");
      await console_.decide(otherMan.publicCode, { decision: "approved" });

      const pendingWoman = await newUser(services);
      await completeSubmission(pendingWoman, "yes", "female");
      // not approved

      const cards = (await feed.getFeed(male.id)).cards;
      const codes = cards.map((c) => c.publicCode);
      expect(codes).toContain(woman.publicCode);
      expect(codes).not.toContain(otherMan.publicCode);
      expect(codes).not.toContain(pendingWoman.publicCode);
      expect(codes).not.toContain(male.publicCode);
      // Values-only: no photo/identity fields.
      const womanCard = cards.find((c) => c.publicCode === woman.publicCode)!;
      expect(womanCard.photoMode).toBe("values_only");
      expect(JSON.stringify(womanCard)).not.toContain("Demo Candidate");

      // After the actor passes on the woman, she leaves the feed.
      await feed.recordDecision(male.id, {
        targetPublicCode: woman.publicCode, decision: "pass", idempotencyKey: crypto.randomUUID(),
      });
      const after = (await feed.getFeed(male.id)).cards;
      expect(after.map((c) => c.publicCode)).not.toContain(woman.publicCode);
      expect(await services.repository.hasDiscoveryDecision(male.id, woman.id)).toBe(true);
    });

    it("persists discovery decisions in the discovery_decision table", async () => {
      const console_ = adminConsole();
      const actor = await newUser(services);
      await completeSubmission(actor, "yes", "male");
      await console_.decide(actor.publicCode, { decision: "approved" });
      const target = await newUser(services);
      await completeSubmission(target, "yes", "female");
      await console_.decide(target.publicCode, { decision: "approved" });

      await discovery().recordDecision(actor.id, {
        targetPublicCode: target.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
      });
      const rows = await harness.pool.query<{ decision: string }>(
        "SELECT decision FROM discovery_decision WHERE actor_user_id = $1 AND target_user_id = $2",
        [actor.id, target.id],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]!.decision).toBe("interested");
    });
  });

  describe("admin-gated connections (Track D)", () => {
    function discovery(): DiscoveryService {
      return new DiscoveryService(services.repository, services.cipher, true);
    }
    function connections(): ConnectionService {
      return new ConnectionService(services.repository, services.cipher, true);
    }
    function adminConsole(): AdminService {
      return new AdminService(services.repository, services.cipher);
    }
    async function approvedPair(): Promise<{ man: UserRecord; woman: UserRecord }> {
      const console_ = adminConsole();
      const man = await newUser(services);
      await completeSubmission(man, "yes", "male");
      await console_.decide(man.publicCode, { decision: "approved" });
      const woman = await newUser(services);
      await completeSubmission(woman, "yes", "female");
      await console_.decide(woman.publicCode, { decision: "approved" });
      return { man, woman };
    }

    async function mutualInterest(
      man: UserRecord,
      woman: UserRecord,
    ): Promise<void> {
      const feed = discovery();
      await feed.recordDecision(man.id, {
        targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
      });
      await feed.recordDecision(woman.id, {
        targetPublicCode: man.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
      });
    }

    // The integration suite shares one disposable database across every test
    // in this file, so pending rows from earlier tests accumulate. Always look
    // up THIS pair's connection by their public codes rather than assuming the
    // pending queue contains only the current pair.
    async function pendingFor(man: UserRecord, woman: UserRecord): Promise<AdminPendingConnection> {
      const all = (await connections().listPending()).connections;
      const match = all.find(
        (c) =>
          (c.userA.publicCode === man.publicCode && c.userB.publicCode === woman.publicCode)
          || (c.userA.publicCode === woman.publicCode && c.userB.publicCode === man.publicCode),
      );
      if (!match) throw new Error(`no pending connection for pair ${man.publicCode}/${woman.publicCode}`);
      return match;
    }

    it("creates a canonical-ordered connection row only on mutual interest", async () => {
      const { man, woman } = await approvedPair();
      const feed = discovery();
      await feed.recordDecision(man.id, {
        targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
      });
      // One-sided: no connection row for this pair yet.
      const oneSided = await harness.pool.query(
        "SELECT id FROM connection WHERE user_a_id IN ($1,$2) AND user_b_id IN ($1,$2)",
        [man.id, woman.id],
      );
      expect(oneSided.rowCount).toBe(0);
      await feed.recordDecision(woman.id, {
        targetPublicCode: man.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
      });
      const rows = await harness.pool.query<{ user_a_id: string; user_b_id: string; status: string }>(
        "SELECT user_a_id, user_b_id, status::text AS status FROM connection WHERE user_a_id IN ($1,$2) AND user_b_id IN ($1,$2)",
        [man.id, woman.id],
      );
      expect(rows.rowCount).toBe(1);
      const row = rows.rows[0]!;
      // Canonical ordering: a < b regardless of who swiped first.
      expect(row.user_a_id < row.user_b_id).toBe(true);
      expect(new Set([row.user_a_id, row.user_b_id])).toEqual(new Set([man.id, woman.id]));
      expect(row.status).toBe("mutual_pending_admin");
    });

    it("runs the full admin-gated lifecycle against the database", async () => {
      const { man, woman } = await approvedPair();
      const svc = connections();
      await mutualInterest(man, woman);
      const connectionId = (await pendingFor(man, woman)).id;

      // Hidden from participants while pending.
      expect((await svc.listForUser(man.id)).connections.map((c) => c.id)).not.toContain(connectionId);

      // Admin approves.
      expect((await svc.decide(connectionId, true)).status).toBe("admin_approved_pending_confirmation");
      expect((await svc.listPending()).connections.map((c) => c.id)).not.toContain(connectionId);

      // Man confirms: still pending the woman's confirmation.
      expect((await svc.confirm(man.id, connectionId, true)).status).toBe("admin_approved_pending_confirmation");
      // Woman confirms: connected.
      expect((await svc.confirm(woman.id, connectionId, true)).status).toBe("connected");

      const manList = (await svc.listForUser(man.id)).connections.filter((c) => c.id === connectionId);
      expect(manList).toHaveLength(1);
      const item = manList[0]!;
      expect(item.status).toBe("connected");
      expect(item.other.publicCode).toBe(woman.publicCode);
      expect(item.other.age).toBeGreaterThanOrEqual(18);
      expect(item.iConfirmed).toBe(true);
      expect(item.theyConfirmed).toBe(true);
      // Values-only: never name/phone/photo.
      const serialized = JSON.stringify(item);
      expect(serialized).not.toContain("Demo Candidate");
      expect(serialized).not.toMatch(/\+2519/);
    });

    it("a participant decline after approval closes the connection as declined", async () => {
      const { man, woman } = await approvedPair();
      const svc = connections();
      await mutualInterest(man, woman);
      const connectionId = (await pendingFor(man, woman)).id;
      await svc.decide(connectionId, true);
      expect((await svc.confirm(woman.id, connectionId, false)).status).toBe("declined");
      const db = await harness.pool.query<{ status: string; closed_at: Date | null }>(
        "SELECT status::text AS status, closed_at FROM connection WHERE id = $1",
        [connectionId],
      );
      expect(db.rows[0]!.status).toBe("declined");
      expect(db.rows[0]!.closed_at).not.toBeNull();
    });

    it("admin rejection stays hidden from participants", async () => {
      const { man, woman } = await approvedPair();
      const svc = connections();
      await mutualInterest(man, woman);
      const connectionId = (await pendingFor(man, woman)).id;
      expect((await svc.decide(connectionId, false)).status).toBe("admin_rejected");
      expect((await svc.listForUser(man.id)).connections.map((c) => c.id)).not.toContain(connectionId);
      expect((await svc.listForUser(woman.id)).connections.map((c) => c.id)).not.toContain(connectionId);
    });
  });
});