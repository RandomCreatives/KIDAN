import { createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const botToken = "123456:SUPER_SECRET_BOT_TOKEN";
const MONITOR_SECRET = "monitor-secret-for-tests";

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

async function buildMonitorApp(): Promise<{ app: FastifyInstance; repository: MemoryPersistenceRepository }> {
  const repository = new MemoryPersistenceRepository();
  const sessions = new SessionService(
    repository,
    new IdentityCipher(randomBytes(32), randomBytes(32)),
    new SecretHasher(randomBytes(32)),
  );
  const app = await buildApp({
    botToken,
    sessionService: sessions,
    monitorSecret: MONITOR_SECRET,
    recordOperationalEvent: (event, now) => void repository.recordOperationalEvent(event, now),
    countOperationalEventsSince: (events, since) => repository.countOperationalEventsSince(events, since),
  });
  return { app, repository };
}

describe("/internal/health monitor probe (Track E3)", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("requires the monitor bearer secret", async () => {
    ({ app } = await buildMonitorApp());
    const noAuth = await app.inject({ method: "GET", url: "/internal/health" });
    expect(noAuth.statusCode).toBe(401);
    const badAuth = await app.inject({
      method: "GET",
      url: "/internal/health",
      headers: { authorization: "Bearer wrong" },
    });
    expect(badAuth.statusCode).toBe(401);
  });

  it("reports ready with zero recent failures, then counts auth failures", async () => {
    const { app: a, repository } = await buildMonitorApp();
    app = a;
    const ok = await app.inject({
      method: "GET",
      url: "/internal/health",
      headers: { authorization: `Bearer ${MONITOR_SECRET}` },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json<{ data: { ok: boolean; ready: boolean; authFailures24h: number; serverErrors24h: number } }>();
    expect(body.data.ok).toBe(true);
    expect(body.data.authFailures24h).toBe(0);

    // Encode an auth failure: an invalid-signed initData hits the validation
    // path, which records an auth_failure signal.
    await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      payload: { initData: "garbage" },
    });
    const recorded = await repository.countOperationalEventsSince(["auth_failure"], new Date(Date.now() - 1000));
    expect(recorded).toBe(1);
  });
});
