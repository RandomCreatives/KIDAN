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

/**
 * Public "Report a concern" from the standalone info hub (apps/info).
 *
 * Anyone can file a concern to the operator without an account. The body is
 * capped tighter than in-app feedback (no session, no identity behind it) and a
 * honeypot field deters naive bots: humans never fill `website`, bots do, and a
 * filled honeypot is silently dropped server-side after passing validation.
 */
export const publicConcernTopicSchema = z.enum([
  "profile_or_behavior",
  "privacy",
  "technical",
  "question",
  "other",
]);
export type PublicConcernTopic = z.infer<typeof publicConcernTopicSchema>;

export const publicConcernSubmitRequestSchema = z.object({
  topic: publicConcernTopicSchema,
  body: z.string().trim().min(1).max(1500),
  /** Optional reply channel the reporter volunteers (Telegram/phone/email). */
  contact: z.string().trim().min(1).max(200).optional(),
  /** Honeypot — must arrive empty; a filled value marks a bot submission. */
  website: z.string().max(200).optional(),
});
export type PublicConcernSubmitRequest = z.infer<typeof publicConcernSubmitRequestSchema>;

export const publicConcernSubmitResponseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type PublicConcernSubmitResponse = z.infer<typeof publicConcernSubmitResponseSchema>;

/** Where a feedback entry came from: the signed-in app, or the public web form. */
export const feedbackSourceSchema = z.enum(["app", "web"]);
export type FeedbackSource = z.infer<typeof feedbackSourceSchema>;

/** Admin list item — a feedback entry with its triage state. */
export const feedbackItemSchema = z.object({
  id: z.string().uuid(),
  /** Public code of the author (KD-XXXXXX), or 'WEB-PUB' for anonymous web submissions. */
  publicCode: z.string().min(6).max(12),
  kind: feedbackKindSchema,
  body: z.string().min(1).max(4000),
  createdAt: z.string().datetime(),
  /** Null until the operator marks it read. */
  readAt: z.string().datetime().nullable(),
  source: feedbackSourceSchema.optional(),
  topic: publicConcernTopicSchema.nullable().optional(),
  /** Reply channel volunteered by a web reporter; operator-only. */
  contact: z.string().max(200).nullable().optional(),
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
