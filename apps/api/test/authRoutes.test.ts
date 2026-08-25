import { createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type BuildAppOptions } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const botToken = "123456:ROUTE_TEST_TOKEN";

function signedInitData(telegramId: string, authDate = new Date()): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(authDate.getTime() / 1000)),
    query_id: "SYNTHETIC_QUERY",
    user: JSON.stringify({ id: telegramId, first_name: "Not retained" }),
  });
  const checkString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(checkString).digest("hex"));
  return params.toString();
}

async function buildTestApp(
  options: Pick<BuildAppOptions, "allowedOrigin" | "secureCookies"> = {},
): Promise<FastifyInstance> {
  const repository = new MemoryPersistenceRepository();
  return buildApp({
    botToken,
    sessionService: new SessionService(
      repository,
      new IdentityCipher(randomBytes(32), randomBytes(32)),
      new SecretHasher(randomBytes(32)),
    ),
    ...options,
  });
}

describe("authentication routes", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("exchanges Telegram initData for an opaque secure cookie without returning IDs", async () => {
    app = await buildTestApp({ secureCookies: true });
    const telegramId = "900719925474000";
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      payload: { initData: signedInitData(telegramId) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(telegramId);
    expect(response.body).not.toContain("userId");
    expect(response.json().data).toMatchObject({ authenticated: true, profileStatus: "new" });
    expect(response.json().data.csrfToken).toHaveLength(43);
    const cookie = response.headers["set-cookie"];
    expect(cookie).toContain("kidan_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("rejects stale initData through the public route", async () => {
    app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      payload: { initData: signedInitData("123", new Date(Date.now() - 301_000)) },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("STALE_INIT_DATA");
  });

  it("restores a session with a stable CSRF token that verifies", async () => {
    app = await buildTestApp({ secureCookies: false });
    const auth = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      payload: { initData: signedInitData("900719925474001") },
    });
    expect(auth.statusCode).toBe(200);
    const authCsrf = auth.json().data.csrfToken;
    const cookie = auth.headers["set-cookie"];
    const session = await app.inject({ method: "GET", url: "/v1/session", headers: { cookie } });
    expect(session.statusCode).toBe(200);
    const body = session.json().data;
    expect(body).toMatchObject({ authenticated: true, profileStatus: "new" });
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken).toHaveLength(43);
    expect(body.csrfToken).toBe(authCsrf);
    const session2 = await app.inject({ method: "GET", url: "/v1/session", headers: { cookie } });
    expect(session2.json().data.csrfToken).toBe(authCsrf);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/session/logout",
      headers: { cookie, "x-csrf-token": authCsrf },
    });
    expect(logout.statusCode).toBe(204);
    const afterLogout = await app.inject({ method: "GET", url: "/v1/session", headers: { cookie } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("rejects session restore without a cookie", async () => {
    app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/v1/session" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects logout with a missing session (401)", async () => {
    app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/session/logout",
      headers: { "x-csrf-token": "x".repeat(43) },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects logout with an invalid CSRF token (403)", async () => {
    app = await buildTestApp();
    const auth = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      payload: { initData: signedInitData("900719925474002") },
    });
    const cookie = auth.headers["set-cookie"];
    const response = await app.inject({
      method: "POST",
      url: "/v1/session/logout",
      headers: { cookie, "x-csrf-token": "y".repeat(43) },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("INVALID_CSRF");
  });

  it("returns the same stable CSRF token for concurrent restorations (R2-02)", async () => {
    app = await buildTestApp();
    const auth = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      payload: { initData: signedInitData("900719925474003") },
    });
    const cookie = auth.headers["set-cookie"];
    const [first, second] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/session", headers: { cookie } }),
      app.inject({ method: "GET", url: "/v1/session", headers: { cookie } }),
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().data.csrfToken).toBe(second.json().data.csrfToken);
  });

  it("rejects a mutation with an invalid Origin (T3-06)", async () => {
    app = await buildTestApp({ allowedOrigin: "https://kidan.app" });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      headers: { origin: "https://evil.example" },
      payload: { initData: signedInitData("900719925474004") },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("INVALID_ORIGIN");
  });

  it("does not require Origin matching for safe GET requests (T3-06)", async () => {
    app = await buildTestApp({ allowedOrigin: "https://kidan.app" });
    const response = await app.inject({
      method: "GET",
      url: "/v1/session",
      headers: { origin: "https://evil.example" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });
});
