import { describe, expect, it, vi } from "vitest";
import { sendPrivacySafeNotification } from "./notifications.js";

describe("privacy-safe notifications", () => {
  it("sends a generic message with protected content", async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const bot = { api: { sendMessage } } as never;

    await sendPrivacySafeNotification(
      bot,
      42,
      "connection_confirmation_required",
      "https://example.test/app",
    );

    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.not.stringMatching(/name|phone|username/i),
      expect.objectContaining({ protect_content: true }),
    );
  });
});
