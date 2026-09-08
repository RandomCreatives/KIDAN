import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { AdminSessionService } from "../src/auth/adminSessionService.js";
import { SessionService } from "../src/auth/sessionService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const SECRET = "admin-notify-test-secret";

describe("GET /internal/admin-notify-test (operator helper)", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  async function build() {
    const repository = new MemoryPersistenceRepository();
    const crypto = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, crypto, new SecretHasher(randomBytes(32)));
    const admin = new AdminSessionService(randomBytes(32), "operator");
    const adminNotifyTest = () => Promise.resolve();
    app = await buildApp({
      botToken: "123:abc",
      sessionService: sessions,
      adminSessionService: admin,
      adminNotifyTestSecret: SECRET,
      adminNotifyTest,
    });
    return { adminNotifyTest };
  }

  it("requires the bearer secret", async () => {
    await build();
    const noAuth = await app!.inject({ method: "GET", url: "/internal/admin-notify-test" });
    expect(noAuth.statusCode).toBe(401);
    const bad = await app!.inject({ method: "GET", url: "/internal/admin-notify-test", headers: { authorization: "Bearer nope" } });
    expect(bad.statusCode).toBe(401);
  });

  it("fires the test notification with the correct bearer secret", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/internal/admin-notify-test", headers: { authorization: `Bearer ${SECRET}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.sent).toBe(true);
  });

  it("is NOT registered when the secret is absent", async () => {
    const repository = new MemoryPersistenceRepository();
    const crypto = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, crypto, new SecretHasher(randomBytes(32)));
    const noSecret = await buildApp({ botToken: "123:abc", sessionService: sessions, adminSessionService: new AdminSessionService(randomBytes(32), "operator") });
    app = noSecret;
    const res = await noSecret.inject({ method: "GET", url: "/internal/admin-notify-test" });
    expect(res.statusCode).toBe(404);
  });
});
