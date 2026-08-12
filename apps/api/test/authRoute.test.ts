import { createHmac } from "node:crypto";
import { telegramAuthResponseSchema } from "@kidan/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { TelegramSessionStore } from "../src/persistence/sessionStore.js";

const botToken = "123456:TEST_ONLY_TOKEN";
const telegramUserId = "900719925474000";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function signedInitData(authDate: Date, overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(authDate.getTime() / 1000)),
    query_id: "TEST_QUERY",
    user: JSON.stringify({ id: telegramUserId, first_name: "Private" }),
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

describe("Telegram auth route", () => {
  it("exchanges valid Telegram init data for an opaque persisted session", async () => {
    const authDate = new Date();
    const expectedAuthDate = new Date(Math.floor(authDate.getTime() / 1000) * 1000);
    const createTelegramSession = vi.fn<TelegramSessionStore["createTelegramSession"]>(async (input) => {
      expect(input.telegramUserId).toBe(BigInt(telegramUserId));
      expect(input.authDate).toEqual(expectedAuthDate);
      return {
        sessionToken: "ks_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12",
        principal: {
          userId: "68d44db3-5e31-44c6-8282-4d06ca1f3f68",
          profileStatus: "new",
          expiresAt: "2026-08-19T09:00:00.000Z",
        },
      };
    });
    const sessionStore = { createTelegramSession } satisfies TelegramSessionStore;
    const app = await buildApp({ botToken, sessionStore });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram/verify",
      payload: { initData: signedInitData(authDate) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.json();
    expect(telegramAuthResponseSchema.safeParse(body).success).toBe(true);
    expect(body.data.sessionReady).toBe(true);
    expect(body.data.session.token).toMatch(/^ks_/);
    expect(JSON.stringify(body)).not.toContain(telegramUserId);
    expect(JSON.stringify(body)).not.toContain("Private");
    expect(createTelegramSession).toHaveBeenCalledOnce();
  });

  it("keeps the validation-only response when no session store is configured", async () => {
    const app = await buildApp({ botToken });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram/verify",
      payload: { initData: signedInitData(new Date()) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(expect.objectContaining({ validated: true, sessionReady: false }));
  });
});
