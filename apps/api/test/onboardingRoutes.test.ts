import { randomBytes } from "node:crypto";
import type { OnboardingProgressPatch } from "@kidan/contracts";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const progress: OnboardingProgressPatch = {
  schemaVersion: "2026-08-12.v1",
  expectedVersion: 0,
  currentStep: "public_profile",
  patch: {
    eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
  },
};

describe("onboarding routes", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("derives the draft owner from the opaque session and isolates users", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
    const onboarding = new OnboardingService(repository, cipher, false);
    const userA = await sessions.issueForTelegramUser(101n, new Date());
    const userB = await sessions.issueForTelegramUser(202n, new Date());
    app = await buildApp({ sessionService: sessions, onboardingService: onboarding });

    const saved = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${userA.sessionToken}`, "x-csrf-token": userA.csrfToken },
      payload: progress,
    });
    expect(saved.statusCode).toBe(200);

    const otherUserDraft = await app.inject({
      method: "GET",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${userB.sessionToken}` },
    });
    expect(otherUserDraft.statusCode).toBe(200);
    expect(otherUserDraft.json().data).toMatchObject({ version: 0, payload: {} });

    const ownerDraft = await app.inject({
      method: "GET",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${userA.sessionToken}` },
    });
    expect(ownerDraft.json().data).toMatchObject({ version: 1, payload: progress.patch });
  });

  it("requires a valid CSRF token for draft mutations", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
    const issued = await sessions.issueForTelegramUser(303n, new Date());
    app = await buildApp({
      sessionService: sessions,
      onboardingService: new OnboardingService(repository, cipher, false),
    });
    const response = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${issued.sessionToken}`, "x-csrf-token": "wrong" },
      payload: progress,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("INVALID_CSRF");
  });

  it("accepts a partial public section save and deep-merges with later sections", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
    const issued = await sessions.issueForTelegramUser(404n, new Date());
    app = await buildApp({
      sessionService: sessions,
      onboardingService: new OnboardingService(repository, cipher, false),
    });

    const partial = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${issued.sessionToken}`, "x-csrf-token": issued.csrfToken },
      payload: {
        schemaVersion: "2026-08-12.v1",
        expectedVersion: 0,
        currentStep: "public_profile",
        patch: { publicProfile: { city: "Addis Ababa" } },
      } satisfies OnboardingProgressPatch,
    });
    expect(partial.statusCode).toBe(200);

    const faith = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${issued.sessionToken}`, "x-csrf-token": issued.csrfToken },
      payload: {
        schemaVersion: "2026-08-12.v1",
        expectedVersion: 1,
        currentStep: "faith_and_family",
        patch: {
          faithAndFamily: {
            faithTradition: "ethiopian_orthodox_tewahedo",
            marriageIntention: "teklil",
            wantsChildren: "yes",
            values: ["active_faith", "honesty", "family_oriented"],
            bio: "A faithful and intentional life partner.",
          },
        },
      } satisfies OnboardingProgressPatch,
    });
    expect(faith.statusCode).toBe(200);

    const draft = await app.inject({
      method: "GET",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${issued.sessionToken}` },
    });
    const payload = draft.json().data.payload as Record<string, Record<string, unknown>>;
    expect(payload.publicProfile?.city).toBe("Addis Ababa");
    expect(payload.faithAndFamily?.values).toEqual(["active_faith", "honesty", "family_oriented"]);
  });

  it("fails closed with the API error envelope when persisted draft JSON violates the contract", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
    const issued = await sessions.issueForTelegramUser(505n, new Date());
    const session = await sessions.authenticate(issued.sessionToken);
    await repository.saveDraft({
      userId: session!.user.id,
      schemaVersion: progress.schemaVersion,
      currentStep: "public_profile",
      publicPayload: { publicProfile: { gender: "unsupported" } },
      expectedVersion: 0,
      now: new Date(),
    });
    app = await buildApp({
      sessionService: sessions,
      onboardingService: new OnboardingService(repository, cipher, false),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${issued.sessionToken}` },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("never persists an out-of-scope (identity) key sent in the draft patch", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
    const issued = await sessions.issueForTelegramUser(505n, new Date());
    app = await buildApp({
      sessionService: sessions,
      onboardingService: new OnboardingService(repository, cipher, false),
    });
    const response = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${issued.sessionToken}`, "x-csrf-token": issued.csrfToken },
      payload: {
        schemaVersion: "2026-08-12.v1",
        expectedVersion: 0,
        currentStep: "public_profile",
        patch: { publicProfile: { city: "Addis Ababa" }, privateIdentity: { fullName: "Jane Doe" } },
      } as unknown as OnboardingProgressPatch,
    });
    expect(response.statusCode).toBe(200);
    const session = await sessions.authenticate(issued.sessionToken);
    const persisted = await repository.getDraft(session!.user.id);
    expect(persisted?.publicPayload.privateIdentity).toBeUndefined();

    const draft = await app.inject({
      method: "GET",
      url: "/v1/onboarding/draft",
      headers: { cookie: `kidan_session=${issued.sessionToken}` },
    });
    const payload = draft.json().data.payload as Record<string, unknown>;
    expect(payload.privateIdentity).toBeUndefined();
    expect(payload.publicProfile).toBeDefined();
  });

  it("serves review-status for the session owner and 401 without a session", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
    const onboarding = new OnboardingService(repository, cipher, false);
    app = await buildApp({ sessionService: sessions, onboardingService: onboarding });

    // No session -> 401.
    const unauthenticated = await app.inject({ method: "GET", url: "/v1/onboarding/review-status" });
    expect(unauthenticated.statusCode).toBe(401);

    const issued = await sessions.issueForTelegramUser(777n, new Date());
    const owner = await app.inject({
      method: "GET",
      url: "/v1/onboarding/review-status",
      headers: { cookie: `kidan_session=${issued.sessionToken}` },
    });
    expect(owner.statusCode).toBe(200);
    // A candidate who has never submitted sees a neutral pending default.
    expect(owner.json().data).toEqual({ status: "pending", feedbackNote: null, decidedAt: null });
  });
});
