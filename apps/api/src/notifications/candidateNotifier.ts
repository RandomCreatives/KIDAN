/**
 * Candidate notification port (B4).
 *
 * Notifications must remain privacy-safe: they never carry a candidate's name,
 * phone number, public code, photo, or any profile detail. They nudge the user
 * to open the secured Mini App, where details are shown only to that
 * authenticated user. This mirrors the bot's privacy-safe message wording.
 */
export type CandidateNotificationKind =
  | "profile_approved"
  | "profile_changes_requested"
  | "profile_rejected";

export interface CandidateNotifier {
  notifyReviewDecision(telegramUserId: bigint, kind: CandidateNotificationKind): Promise<void>;
}
