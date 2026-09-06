import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramCandidateNotifier } from "../src/notifications/telegramNotifier.js";

describe("TelegramCandidateNotifier", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends a privacy-safe message with a Mini App button and no identity", async () => {
    const fetchMock = vi.fn(
      async (..._args: unknown[]) => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const notifier = new TelegramCandidateNotifier("123:SECRET", "https://app.example.test/");
    await notifier.notifyReviewDecision(9007199254740555n, "profile_approved");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain("/bot123:SECRET/sendMessage");
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe("9007199254740555");
    expect(body.protect_content).toBe(true);
    expect(body.reply_markup.inline_keyboard[0][0].web_app.url).toBe("https://app.example.test/");
    // No identifying fields in the message text.
    expect(body.text).not.toMatch(/9007|name|phone|KD-/i);
    // The token is never sent in the request body.
    expect(init.body as string).not.toContain("SECRET");
  });

  it("does not throw when Telegram returns an error (non-blocking)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const notifier = new TelegramCandidateNotifier("123:SECRET", "https://app.example.test/");
    await expect(notifier.notifyReviewDecision(1n, "profile_rejected")).resolves.toBeUndefined();
  });

  it("does not throw when fetch rejects (non-blocking)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const notifier = new TelegramCandidateNotifier("123:SECRET", "https://app.example.test/");
    await expect(notifier.notifyReviewDecision(1n, "profile_changes_requested")).resolves.toBeUndefined();
  });
});
