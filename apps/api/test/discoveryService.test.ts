import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  consentDraftSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";
import { DiscoveryService } from "../src/discovery/discoveryService.js";
import { AdminService } from "../src/admin/adminService.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

type ValueTag = z.infer<typeof valueTagSchema>;
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;

interface Created {
  userId: string;
  publicCode: string;
  sessions: SessionService;
  onboarding: OnboardingService;
  admin: AdminService;
  repository: MemoryPersistenceRepository;
}

async function createCandidate(
  telegramId: bigint,
  gender: "female" | "male",
  city: string,
  repo: MemoryPersistenceRepository,
  cipher: IdentityCipher,
  sessions: SessionService,
  onboarding: OnboardingService,
  admin: AdminService,
  approved: boolean,
): Promise<Created> {
  const issued = await sessions.issueForTelegramUser(telegramId, new Date());
  const session = await sessions.authenticate(issued.sessionToken);
  const userId = session!.user.id;
  const patch: OnboardingProgressPatch = {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    currentStep: "public_preview",
    expectedVersion: 0,
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      publicProfile: {
        gender, countryCode: "ET", city, educationLevel: "bachelors" as const,
        fieldOfStudy: "General", employmentStatus: "employed" as const,
        occupationCategory: "Office", maritalStatus: "never_married" as const,
        hasChildren: false, heightCm: 170,
      },
      faithAndFamily: {
        faithTradition: "ethiopian_orthodox_tewahedo" as const, marriageIntention: "teklil" as const,
        wantsChildren: "yes" as const, values: ["active_faith", "honesty", "family_oriented"] as ValueTag[],
        bio: "Discovery service test bio long enough to satisfy the minimum bio length validation rule.",
      },
      partnerPreferences: {
        ageMin: 22, ageMax: 40, preferredCities: [city], openToAbroad: false,
        acceptedMaritalStatuses: ["never_married" as const], acceptsPartnerWithChildren: false,
        desiredValues: ["active_faith" as ValueTag], acceptedMarriageIntentions: ["teklil" as const],
        additionalPreferences: "",
      },
    },
  };
  const saved = await onboarding.saveProgress(userId, patch);
  await onboarding.savePrivateIdentity(userId, {
    fullName: `Person ${city}`, dateOfBirth: "1996-01-01", phoneNumber: `+2519${Math.floor(Math.random() * 1e8)}`,
    verificationPhotoStatus: "pending_upload",
  });
  await onboarding.saveVerificationPhoto(userId, { dataUrl: JPEG });
  await onboarding.submit(userId, {
    expectedVersion: saved.version,
    consent: consentDraftSchema.parse({
      informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
      discoveryPublication: true, verificationPhotoRetention: true, communityRules: true, botNotifications: false,
    }),
  });
  const user = (await sessions.authenticate(issued.sessionToken))!.user;
  if (approved) await admin.decide(user.publicCode, { decision: "approved" });
  return { userId, publicCode: user.publicCode, sessions, onboarding, admin, repository: repo };
}

async function setup() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const onboarding = new OnboardingService(repository, cipher, true);
  const admin = new AdminService(repository, cipher);
  const discovery = new DiscoveryService(repository, cipher, true);
  return { repository, cipher, sessions, onboarding, admin, discovery };
}

describe("values-only discovery (Track C)", () => {
  it("returns an empty feed when submissions are disabled", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const discovery = new DiscoveryService(repository, cipher, false);
    const feed = await discovery.getFeed("any-user");
    expect(feed.cards).toEqual([]);
    expect(feed.hasMore).toBe(false);
  });

  it("serves only approved opposite-gender cards, with values-only fields and no identity", async () => {
    const env = await setup();
    // Actor: male looking for women.
    const actor = await createCandidate(
      900000000000001n, "male", "Addis Ababa",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, true,
    );
    // Approved woman -> should appear.
    const woman = await createCandidate(
      900000000000002n, "female", "Addis Ababa",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, true,
    );
    // Approved man -> same gender as actor's preference? Actor male wants female, so excluded.
    await createCandidate(
      900000000000003n, "male", "Adama",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, true,
    );
    // Pending woman -> not approved, excluded.
    await createCandidate(
      900000000000004n, "female", "Bahir Dar",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, false,
    );

    const feed = await env.discovery.getFeed(actor.userId);
    expect(feed.cards).toHaveLength(1);
    const card = feed.cards[0]!;
    expect(card.publicCode).toBe(woman.publicCode);
    expect(card.gender).toBe("female");
    expect(card.photoMode).toBe("values_only");
    expect(card.verified).toBe(true);
    // No identity fields leak into the card.
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain("Person");
    expect(serialized).not.toMatch(/phone|fullName|telegram/i);
    expect(card).not.toHaveProperty("photo");
  });

  it("excludes a target the actor has already decided on", async () => {
    const env = await setup();
    const actor = await createCandidate(
      900000000000011n, "female", "Addis Ababa",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, true,
    );
    const man = await createCandidate(
      900000000000012n, "male", "Addis Ababa",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, true,
    );
    // Actor passes on the man.
    await env.discovery.recordDecision(actor.userId, {
      targetPublicCode: man.publicCode, decision: "pass", idempotencyKey: randomUUID(),
    });
    const feed = await env.discovery.getFeed(actor.userId);
    expect(feed.cards).toHaveLength(0);
    expect(await env.repository.hasDiscoveryDecision(actor.userId, man.userId)).toBe(true);
  });

  it("records an interested decision and is idempotent", async () => {
    const env = await setup();
    const actor = await createCandidate(
      900000000000021n, "male", "Addis Ababa",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, true,
    );
    const woman = await createCandidate(
      900000000000022n, "female", "Addis Ababa",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, true,
    );
    const key = randomUUID();
    await env.discovery.recordDecision(actor.userId, {
      targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: key,
    });
    // Replaying with the same target is a no-op (no error).
    await expect(
      env.discovery.recordDecision(actor.userId, {
        targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: randomUUID(),
      }),
    ).resolves.toBeUndefined();
    expect(await env.repository.hasDiscoveryDecision(actor.userId, woman.userId)).toBe(true);
  });

  it("rejects a decision for an unknown target", async () => {
    const env = await setup();
    const actor = await createCandidate(
      900000000000031n, "male", "Addis Ababa",
      env.repository, env.cipher, env.sessions, env.onboarding, env.admin, true,
    );
    await expect(
      env.discovery.recordDecision(actor.userId, {
        targetPublicCode: "KD-222222", decision: "pass", idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow("TARGET_NOT_FOUND");
  });
});
