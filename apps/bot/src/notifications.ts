import type { Bot } from "grammy";

export type SafeNotificationKind =
  | "profile_review_complete"
  | "private_update"
  | "connection_confirmation_required"
  | "safety_update";

const safeMessages: Record<SafeNotificationKind, string> = {
  profile_review_complete: "Your profile review is complete. Open Kidan to view the result.",
  private_update: "You have a private update in Kidan.",
  connection_confirmation_required: "A connection requires your private confirmation. Open Kidan to review it.",
  safety_update: "A safety request has been updated. Open Kidan for details.",
};

export async function sendPrivacySafeNotification(
  bot: Bot,
  chatId: number,
  kind: SafeNotificationKind,
  miniAppUrl: string,
): Promise<void> {
  await bot.api.sendMessage(chatId, safeMessages[kind], {
    reply_markup: {
      inline_keyboard: [[{ text: "Open Kidan", web_app: { url: miniAppUrl } }]],
    },
    protect_content: true,
  });
}
