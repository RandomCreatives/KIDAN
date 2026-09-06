import type { CandidateNotificationKind, CandidateNotifier } from "./candidateNotifier.js";

/**
 * Telegram implementation of the candidate notification port. Uses the Bot API
 * sendMessage with an inline "Open Kidan" Mini App button. Messages contain no
 * identity, matching the bot's privacy-safe wording. A failed notification is
 * logged but never blocks the admin decision (the candidate still sees their
 * status inside the Mini App).
 */
const messages: Record<CandidateNotificationKind, string> = {
  profile_approved:
    "Your Kidan profile review is complete and approved. Open Kidan to continue.",
  profile_changes_requested:
    "Your Kidan profile needs a small update before it can be published. Open Kidan to see the private note.",
  profile_rejected:
    "Your Kidan profile review is complete. Open Kidan to view the result privately.",
};

export class TelegramCandidateNotifier implements CandidateNotifier {
  constructor(
    private readonly botToken: string,
    private readonly miniAppUrl: string,
  ) {}

  async notifyReviewDecision(telegramUserId: bigint, kind: CandidateNotificationKind): Promise<void> {
    const chatId = telegramUserId.toString();
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messages[kind],
          protect_content: true,
          reply_markup: {
            inline_keyboard: [[{ text: "Open Kidan", web_app: { url: this.miniAppUrl } }]],
          },
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        // Never include the token (it is in the URL, not logged).
        console.error(`[kidan-api] telegram notify failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[kidan-api] telegram notify error", error instanceof Error ? error.message : "unknown");
    }
  }
}

/** Null-object notifier used when notifications are not configured. */
export class NoopCandidateNotifier implements CandidateNotifier {
  async notifyReviewDecision(): Promise<void> {
    /* notifications disabled */
  }
}
