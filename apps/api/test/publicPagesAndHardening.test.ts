import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const botToken = "123456:ROUTE_TEST_TOKEN";

async function buildTestApp(overrides: Parameters<typeof buildApp>[0] = {}): Promise<FastifyInstance> {
  const repository = new MemoryPersistenceRepository();
  return buildApp({
    botToken,
    sessionService: new SessionService(
      repository,
      new IdentityCipher(randomBytes(32), randomBytes(32)),
      new SecretHasher(randomBytes(32)),
    ),
    ...overrides,
  });
}

describe("public legal pages and 404 shell", () => {
  it("serves the privacy notice and terms as public HTML", async () => {
    const app = await buildTestApp();
    const privacy = await app.inject({ method: "GET", url: "/privacy" });
    expect(privacy.statusCode).toBe(200);
    expect(privacy.headers["content-type"]).toContain("text/html");
    expect(privacy.body).toContain("Proclamation No. 1321/2024");
    expect(privacy.body).toContain("verification photo");
    const terms = await app.inject({ method: "GET", url: "/terms" });
    expect(terms.statusCode).toBe(200);
    expect(terms.body).toContain("Governing law");
    await app.close();
  });

  it("content-negotiates 404s: HTML for browsers, JSON for API clients", async () => {
    const app = await buildTestApp();
    const html = await app.inject({
      method: "GET",
      url: "/nope",
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    expect(html.statusCode).toBe(404);
    expect(html.headers["content-type"]).toContain("text/html");
    expect(html.body).toContain("Nothing here");
    const json = await app.inject({
      method: "GET",
      url: "/v1/nope",
      headers: { accept: "application/json" },
    });
    expect(json.statusCode).toBe(404);
    expect(json.json().error.code).toBe("NOT_FOUND");
    await app.close();
  });
});

describe("security headers", () => {
  it("always sends framing/content sniffing guards", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
    await app.close();
  });

  it("advertises HSTS only when cookies are Secure (production)", async () => {
    const app = await buildTestApp({ secureCookies: true });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["strict-transport-security"]).toContain("max-age=63072000");
    await app.close();
  });
});

describe("transport IP rate limits", () => {
  it("are off by default in the test environment", async () => {
    const app = await buildTestApp();
    let last = 0;
    for (let i = 0; i < 125; i += 1) {
      last = (await app.inject({
        method: "POST",
        url: "/v1/auth/telegram",
        payload: { initData: "garbage" },
      })).statusCode;
    }
    expect(last).toBe(401);
    await app.close();
  });

  it("trip with 429 and a retry hint when explicitly enabled", async () => {
    const app = await buildTestApp({ ipRateLimits: true });
    const codes: number[] = [];
    for (let i = 0; i < 122; i += 1) {
      codes.push((await app.inject({
        method: "POST",
        url: "/v1/auth/telegram",
        payload: { initData: "garbage" },
      })).statusCode);
    }
    expect(codes.filter((c) => c === 401)).toHaveLength(120);
    expect(codes[codes.length - 1]).toBe(429);
    const body = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      payload: { initData: "garbage" },
    });
    expect(body.json().error.code).toBe("RATE_LIMITED");
    expect(typeof body.json().error.retryAfterSeconds).toBe("number");
    await app.close();
  });
});
