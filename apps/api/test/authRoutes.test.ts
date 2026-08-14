import { createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
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

describe("authentication routes", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("exchanges Telegram initData for an opaque secure cookie without returning IDs", async () => {
    const repository = new MemoryPersistenceRepository();
    const sessions = new SessionService(
      repository,
      new IdentityCipher(randomBytes(32), randomBytes(32)),
      new SecretHasher(randomBytes(32)),
    );
    app = await buildApp({ botToken, sessionService: sessions, secureCookies: true });
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
    const repository = new MemoryPersistenceRepository();
    app = await buildApp({
      botToken,
      sessionService: new SessionService(
        repository,
        new IdentityCipher(randomBytes(32), randomBytes(32)),
        new SecretHasher(randomBytes(32)),
      ),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      payload: { initData: signedInitData("123", new Date(Date.now() - 301_000)) },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("STALE_INIT_DATA");
  });

  it("restores a session with a stable CSRF token that verifies", async () => {
    const repository = new MemoryPersistenceRepository();
    app = await buildApp({
      botToken,
      sessionService: new SessionService(
        repository,
        new IdentityCipher(randomBytes(32), randomBytes(32)),
        new SecretHasher(randomBytes(32)),
      ),
      secureCookies: false,
    });
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
    const repository = new MemoryPersistenceRepository();
    app = await buildApp({
      botToken,
      sessionService: new SessionService(
        repository,
        new IdentityCipher(randomBytes(32), randomBytes(32)),
        new SecretHasher(randomBytes(32)),
      ),
    });
    const response = await app.inject({ method: "GET", url: "/v1/session" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });
});
