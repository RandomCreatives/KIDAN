import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { OnboardingProgressPatch } from "@kidan/contracts";
import { buildApp } from "../../src/app.js";
import { SessionAccessError, SessionService } from "../../src/auth/sessionService.js";
import { OnboardingService } from "../../src/onboarding/onboardingService.js";
import { PostgresPersistenceRepository } from "../../src/persistence/postgresRepository.js";
import type { UserRecord } from "../../src/persistence/types.js";
import { IdentityCipher, SecretHasher } from "../../src/security/crypto.js";
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

function makePatch(wantsChildren: "yes" | "no" | "open_to_discussion" = "yes"): OnboardingProgressPatch {
  return {
    schemaVersion: "2026-08-12.v1",
    expectedVersion: 0,
    currentStep: "public_preview",
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      publicProfile: {
        gender: "female", countryCode: "ET", city: "Addis Ababa", educationLevel: "bachelors",
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

async function completeSubmission(user: UserRecord, want: "yes" | "no" | "open_to_discussion" = "yes"): Promise<void> {
  const draft = await services.onboarding.saveProgress(user.id, makePatch(want));
  await services.onboarding.savePrivateIdentity(user.id, {
    fullName: "Demo Candidate", dateOfBirth: "1996-01-01", phoneNumber: "+251900000000",
  });
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
    const codeA = `KD-${randomBytes(3).toString("hex").toUpperCase()}`;
    const codeB = `KD-${randomBytes(3).toString("hex").toUpperCase()}`;
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
    const user = await newUser(services);
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

  it("authenticates active sessions and rejects expired and revoked ones", async () => {
    const issued = await services.sessions.issueForTelegramUser(nextTelegramId++, new Date());
    expect(await services.sessions.authenticate(issued.sessionToken)).not.toBeNull();

    await services.sessions.revoke(issued.sessionToken);
    expect(await services.sessions.authenticate(issued.sessionToken)).toBeNull();
    expect(await services.sessions.authenticate(
      issued.sessionToken,
      new Date(issued.expiresAt.getTime() + 1_000),
    )).toBeNull();
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
      fullName: "Changed Later", dateOfBirth: "1990-01-01", phoneNumber: "+251911111111",
    })).rejects.toThrow("DRAFT_ALREADY_SUBMITTED");
  });

  it("rolls back all writes when a submission fails mid-transaction", async () => {
    const user = await newUser(services);
    await services.onboarding.saveProgress(user.id, makePatch("yes"));
    await services.onboarding.savePrivateIdentity(user.id, {
      fullName: "Demo Candidate", dateOfBirth: "1996-01-01", phoneNumber: "+251900000000",
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
      fullName: "Context Bound", dateOfBirth: "1996-01-01", phoneNumber: "+251900000000",
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
});