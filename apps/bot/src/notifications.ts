import type { Bot } from "grammy";

export type SafeNotificationKind =
  | "profile_approved"
  | "profile_changes_requested"
  | "profile_rejected"
  | "profile_review_complete"
  | "private_update"
  | "connection_confirmation_required"
  | "safety_update";

const safeMessages: Record<SafeNotificationKind, string> = {
  // B4 wording — kept identical to the API's TelegramCandidateNotifier so the
  // candidate receives the same privacy-safe message whichever sender fires.
  profile_approved:
    "Your Kidan profile review is complete and approved. Open Kidan to continue.",
  profile_changes_requested:
    "Your Kidan profile needs a small update before it can be published. Open Kidan to see the private note.",
  profile_rejected:
    "Your Kidan profile review is complete. Open Kidan to view the result privately.",
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
