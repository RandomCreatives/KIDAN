import { z } from "zod";
import { discoveryProfileSchema } from "./profile.js";

/**
 * Values-only discovery (Track C).
 *
 * Discovery cards carry ONLY the values-only public projection — never a name,
 * phone number, Telegram username, photo, or contact detail. The card id is the
 * target's public code (KD-XXXXXX), which is also the reference used when the
 * candidate records a pass/interested decision.
 */

/** A daily page of values-only discovery cards. */
export const discoveryFeedResponseSchema = z.object({
  cards: z.array(discoveryProfileSchema),
  /** True when more cards may be available beyond this page. */
  hasMore: z.boolean(),
});
export type DiscoveryFeedResponse = z.infer<typeof discoveryFeedResponseSchema>;

export const discoveryDecisionRequestSchema = z.object({
  /** Target public code (KD-XXXXXX). */
  targetPublicCode: z.string().min(6).max(12),
  decision: z.enum(["pass", "interested"]),
  /** Client-generated idempotency key (UUID) so retries don't double-record. */
  idempotencyKey: z.string().uuid(),
});
export type DiscoveryDecisionRequest = z.infer<typeof discoveryDecisionRequestSchema>;

export const discoveryDecisionResponseSchema = z.object({
  recorded: z.literal(true),
});
