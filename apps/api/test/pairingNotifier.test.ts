import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramPairingNotifier } from "../src/notifications/pairingNotifier.js";
import type { PairingPulseKind } from "../src/persistence/types.js";

const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";

function pulseRow(kind: PairingPulseKind, context: Record<string, unknown> = {}) {
  return {
    id: "pulse-1",
    userId: "44444444-4444-4444-8444-444444444444",
    connectionId: CONNECTION_ID,
    kind,
    status: "pending",
    answer: null,
    context,
    createdAt: new Date("2026-09-12T06:00:00.000Z"),
    answeredAt: null,
  } as never;
}

describe("TelegramPairingNotifier deep-link CTA", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function sentKeyboard(kind: PairingPulseKind, context: Record<string, unknown> = {}) {
    const fetchMock = vi.fn(
      async () => new Response("{\"ok\":true}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const notifier = new TelegramPairingNotifier("token", "https://mini.kidan.app/");
    await notifier.sendPulse(777n, { pulse: pulseRow(kind, context), counterpartCode: "KD-223344" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return JSON.parse(String(init.body)) as {
      reply_markup: { inline_keyboard: { text: string; web_app?: { url: string }; callback_data?: string }[][] };
    };
  }

  it("adds the Mini App deep-link row to readiness pulses", async () => {
    const body = await sentKeyboard("readiness");
    const rows = body.reply_markup.inline_keyboard;
    const cta = rows.at(-1)!.at(0);
    expect(cta).toBeTruthy();
    expect(cta!.text).toMatch(/next step/i);
    expect(cta!.web_app?.url).toBe("https://mini.kidan.app/?tab=pairing&connection=" + CONNECTION_ID + "&from=bot");
    // Answer buttons are untouched and privacy-safe callback payloads only.
    expect(rows[0]![0]!.callback_data).toContain("pair:pulse-1:ready");
  });

  it("adds the deep link to stall probes and check-ins as well", async () => {
    expect((await sentKeyboard("stall_probe", { role: "still_waiting_probe" })).reply_markup.inline_keyboard.at(-1)![0]!.web_app).toBeTruthy();
    expect((await sentKeyboard("check_in")).reply_markup.inline_keyboard.at(-1)![0]!.web_app).toBeTruthy();
  });

  it("omits the deep link for closing follow-ups (path already closed)", async () => {
    const body = await sentKeyboard("closing_followup");
    for (const row of body.reply_markup.inline_keyboard) {
      expect(row[0]!.web_app).toBeUndefined();
    }
  });

  it("sends without the CTA when no Mini App URL is configured", async () => {
    const fetchMock = vi.fn(
      async () => new Response("{\"ok\":true}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const notifier = new TelegramPairingNotifier("token");
    await notifier.sendPulse(777n, { pulse: pulseRow("readiness"), counterpartCode: "KD-223344" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      reply_markup: { inline_keyboard: { web_app?: { url: string } }[][] };
    };
    expect(body.reply_markup.inline_keyboard).toHaveLength(2);
    expect(body.reply_markup.inline_keyboard.every((row) => !row[0]!.web_app)).toBe(true);
  });
});
