import type { AdminNotifier, AdminNotification } from "./adminNotifier.js";

/**
 * Telegram implementation of the admin notifier. Messages go to a single
 * operator chat id and carry an inline "Open console" Telegram Mini App button
 * (the web_app button opens the admin console in the phone's in-chat browser).
 * Content is composed by the caller and is privacy-safe by contract.
 */
export class TelegramAdminNotifier implements AdminNotifier {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly consoleUrl: string,
  ) {}

  async notify(notification: AdminNotification): Promise<void> {
    const endpoint = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: notification.message,
          protect_content: true,
          reply_markup: {
            inline_keyboard: [[{ text: "Open console", web_app: { url: this.consoleUrl } }]],
          },
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        // Never log the token (it is in the URL, which is not logged).
        console.error(`[kidan-api] admin notify failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[kidan-api] admin notify error", error instanceof Error ? error.message : "unknown");
    }
  }
}

/** Null-object notifier used when the admin bot is not configured. */
export class NoopAdminNotifier implements AdminNotifier {
  async notify(): Promise<void> {
    /* admin notifications disabled */
  }
}
