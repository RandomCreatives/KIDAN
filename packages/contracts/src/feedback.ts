import { z } from "zod";

/**
 * Feedback / comments / concerns from a candidate to the operator.
 *
 * These are the user's OWN words sent to the operator for support and
 * triage. They are deliberately NOT the subject of privacy rules that apply
 * to discovery content (there is no other person here) — but the message
 * text is treated as user-provided free text, limits are enforced, and it is
 * never logged in full or echoed into chat. Any contact detail the user
 * includes is preserved for the operator to respond; nothing is auto-revealed.
 *
 * `kind` distinguishes the source/use:
 *  - `report`   : a concern / problem the operator must look at ("Report a concern").
 *  - `feedback` : general feedback or a suggestion.
 *  - `comment`  : a comment / question for the operator.
 */

export const feedbackKindSchema = z.enum(["report", "feedback", "comment"]);
export type FeedbackKind = z.infer<typeof feedbackKindSchema>;

export const feedbackSubmitRequestSchema = z.object({
  kind: feedbackKindSchema,
  body: z.string().trim().min(1).max(4000),
});
export type FeedbackSubmitRequest = z.infer<typeof feedbackSubmitRequestSchema>;

export const feedbackSubmitResponseSchema = z.object({
  id: z.string().uuid(),
  kind: feedbackKindSchema,
  createdAt: z.string().datetime(),
});
export type FeedbackSubmitResponse = z.infer<typeof feedbackSubmitResponseSchema>;

/** Admin list item — a feedback entry with its triage state. */
export const feedbackItemSchema = z.object({
  id: z.string().uuid(),
  /** Public code of the author (KD-XXXXXX), the only identifier shown in lists. */
  publicCode: z.string().min(6).max(12),
  kind: feedbackKindSchema,
  body: z.string().min(1).max(4000),
  createdAt: z.string().datetime(),
  /** Null until the operator marks it read. */
  readAt: z.string().datetime().nullable(),
});
export type FeedbackItem = z.infer<typeof feedbackItemSchema>;

export const feedbackListResponseSchema = z.object({
  items: z.array(feedbackItemSchema),
  unreadCount: z.number().int().min(0),
});
export type FeedbackListResponse = z.infer<typeof feedbackListResponseSchema>;

/** Bot can fetch a user's onboarding/approval tier by Telegram id (internal). */
export const botTierResponseSchema = z.object({
  tier: z.enum(["new", "active"]),
});
export type BotTierResponse = z.infer<typeof botTierResponseSchema>;
