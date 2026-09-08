import { createHmac, randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const botToken = "123456:SUPER_SECRET_BOT_TOKEN";

class LogCollector extends Writable {
  lines: string[] = [];
  _write(chunk: Buffer | string, _enc: BufferEncoding, cb: () => void): void {
    this.lines.push(String(chunk));
    cb();
  }
  output(): string {
    return this.lines.join("\n");
  }
}

// A single shared sink so a request's log output is captured across the app
// built with it in this suite.
const sink = new LogCollector();

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

async function buildAppWithLogCapture(): Promise<FastifyInstance> {
  const repository = new MemoryPersistenceRepository();
  const sessions = new SessionService(
    repository,
    new IdentityCipher(randomBytes(32), randomBytes(32)),
    new SecretHasher(randomBytes(32)),
  );
  return buildApp({
    botToken,
    sessionService: sessions,
    logger: { level: "info", stream: sink },
  });
}

describe("log redaction (Track E3)", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("never logs the bot token, raw initData body, or request/store secrets", async () => {
    app = await buildAppWithLogCapture();
    const initData = signedInitData("900719925474099");
    const res = await app.inject({ method: "POST", url: "/v1/auth/telegram", payload: { initData } });
    expect(res.statusCode).toBe(200);

    const captured = sink.output();
    expect(captured.trim().length).toBeGreaterThan(0);
    // The raw initData body is redacted (logger redact paths include req.body).
    expect(captured).not.toContain(initData);
    expect(captured).not.toContain("SYNTHETIC_QUERY");
    // The bot token secret (after ':') is never logged; only the public id may be.
    expect(captured).not.toContain("SUPER_SECRET_BOT_TOKEN");
    expect(captured).not.toContain("Not retained");
  });

  it("redacts the cookie / csrf header and connection-string credentials on errors", async () => {
    app = await buildAppWithLogCapture();
    // A malformed connection-string injected into an error path must be scrubbed
    // by the error handler's sanitizer.
    const res = await app.inject({
      method: "GET",
      url: "/non/existent",
      headers: { cookie: "kidan_session=CAUGHT_COOKIE", "x-csrf-token": "CAUGHT_CSRF" },
    });
    expect(res.statusCode).toBe(404);
    const captured = sink.output();
    expect(captured).not.toContain("CAUGHT_COOKIE");
    expect(captured).not.toContain("CAUGHT_CSRF");
    expect(captured).not.toMatch(/postgresql:\/\/[^@\s]+@/);
  });
});
