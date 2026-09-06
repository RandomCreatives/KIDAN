import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { DiscoveryService } from "../src/discovery/discoveryService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

describe("discovery routes", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  async function build() {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
    const onboarding = new OnboardingService(repository, cipher, true);
    const discovery = new DiscoveryService(repository, cipher, true);
    app = await buildApp({ logger: false, sessionService: sessions, onboardingService: onboarding, discoveryService: discovery });
    const issued = await sessions.issueForTelegramUser(555n, new Date());
    return { app, token: issued.sessionToken, csrf: issued.csrfToken };
  }

  it("requires a session for the feed", async () => {
    const ctx = await build();
    const res = await ctx.app.inject({ method: "GET", url: "/v1/discovery/feed" });
    expect(res.statusCode).toBe(401);
  });

  it("returns an empty values-only feed for a session with no matches", async () => {
    const ctx = await build();
    const res = await ctx.app.inject({
      method: "GET",
      url: "/v1/discovery/feed",
      headers: { cookie: `kidan_session=${ctx.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ cards: [], hasMore: false });
  });

  it("rejects a decision without CSRF", async () => {
    const ctx = await build();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/discovery/decision",
      headers: { cookie: `kidan_session=${ctx.token}` },
      payload: { targetPublicCode: "KD-2A3B4C", decision: "pass", idempotencyKey: randomUUID() },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("INVALID_CSRF");
  });

  it("404s a decision for an unknown target with CSRF", async () => {
    const ctx = await build();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/discovery/decision",
      headers: { cookie: `kidan_session=${ctx.token}`, "x-csrf-token": ctx.csrf },
      payload: { targetPublicCode: "KD-222222", decision: "pass", idempotencyKey: randomUUID() },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("TARGET_NOT_FOUND");
  });

  it("rejects a malformed decision body", async () => {
    const ctx = await build();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/discovery/decision",
      headers: { cookie: `kidan_session=${ctx.token}`, "x-csrf-token": ctx.csrf },
      payload: { targetPublicCode: "KD-2A3B4C", decision: "maybe" },
    });
    expect(res.statusCode).toBe(400);
  });
});
