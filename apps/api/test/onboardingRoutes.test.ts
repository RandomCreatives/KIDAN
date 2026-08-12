import { randomBytes } from "node:crypto";
import type { OnboardingProgressPatch } from "@kidan/contracts";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
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
});
