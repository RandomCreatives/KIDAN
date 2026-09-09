/**
 * Admin notification port (operator console bot).
 *
 * The admin bot is a *separate* bot from the candidate bot and is used only by
 * the operator. It carries privacy-safe, values-only content — a public code or
 * a generic queue prompt plus a one-tap button that opens the admin console as
 * a Telegram Mini App. It NEVER carries a candidate's name, phone number,
 * photo, Telegram username, or any profile detail. Identity/photo review stays
 * inside the admin console (which is itself reached from the bot).
 */
export type AdminNotificationKind =
  | "new_submission"
  | "connection_pending_admin"
  | "health_degraded"
  | "new_feedback";

export interface AdminNotification {
  kind: AdminNotificationKind;
  /** Privacy-safe, fully-formed message (may include a public code, never identity). */
  message: string;
}

export interface AdminNotifier {
  notify(notification: AdminNotification): Promise<void>;
}
