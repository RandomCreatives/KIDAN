import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateTelegramInitData } from "../src/auth/telegramInitData.js";

const botToken = "123456:TEST_ONLY_TOKEN";
const now = new Date("2026-08-12T09:00:00.000Z");

function signedInitData(overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(now.getTime() / 1000)),
    query_id: "TEST_QUERY",
    user: JSON.stringify({ id: 900719925474000, first_name: "Private" }),
    ...overrides,
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("validateTelegramInitData", () => {
  it("validates signed and fresh data without exposing profile fields", () => {
    const result = validateTelegramInitData(signedInitData(), { botToken, now });
    expect(result.telegramUserId).toBe(900719925474000n);
    expect(result.authDate).toEqual(now);
  });

  it("rejects tampering", () => {
    const tampered = new URLSearchParams(signedInitData());
    tampered.set("auth_date", String(Math.floor(now.getTime() / 1000) - 1));
    expect(() => validateTelegramInitData(tampered.toString(), { botToken, now })).toThrowError(
      expect.objectContaining({ code: "INVALID_SIGNATURE" }),
    );
  });

  it("rejects stale data", () => {
    const oldDate = String(Math.floor(now.getTime() / 1000) - 301);
    expect(() => validateTelegramInitData(signedInitData({ auth_date: oldDate }), { botToken, now })).toThrowError(
      expect.objectContaining({ code: "STALE_INIT_DATA" }),
    );
  });
});
