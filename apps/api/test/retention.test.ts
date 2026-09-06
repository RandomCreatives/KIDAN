import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

describe("internal retention endpoint", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("rejects the retention job without the bearer secret", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const onboarding = new OnboardingService(
      repository,
      cipher,
      true,
    );
    app = await buildApp({
      logger: false,
      sessionService: new SessionService(repository, cipher, new SecretHasher(randomBytes(32))),
      onboardingService: onboarding,
      retentionSecret: "topsecret",
      retentionPurge: () => onboarding.purgeExpiredVerificationPhotos(),
    });
    const response = await app.inject({ method: "POST", url: "/internal/retention" });
    expect(response.statusCode).toBe(401);
  });

  it("runs the purge with the correct bearer secret", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const onboarding = new OnboardingService(repository, cipher, true);
    app = await buildApp({
      logger: false,
      retentionSecret: "topsecret",
      retentionPurge: async () => {
        // No photos due in memory; exercise the handler returns count.
        return onboarding.purgeExpiredVerificationPhotos();
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/internal/retention",
      headers: { authorization: "Bearer topsecret" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.purged).toBe(0);
  });

  it("does not register the retention endpoint when no secret is configured", async () => {
    app = await buildApp({ logger: false });
    const response = await app.inject({ method: "POST", url: "/internal/retention" });
    expect(response.statusCode).toBe(404);
  });
});
