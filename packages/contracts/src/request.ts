import { z } from "zod";
import { discoveryProfileSchema, publicProfileCodeSchema } from "./profile.js";

// Track D2: intentional introduction requests.
//
// A right-swipe is private (a personal shortlist). The committed act is a
// formal introduction request, capped per sender per rolling 24h, expiring
// unanswered after 72h. Declines are never surfaced to the sender.

/** Policy constant: max requests a sender may create per rolling 24 hours. */
export const INTENTION_REQUEST_DAILY_CAP = 5;
/** Policy constant: unanswered requests expire after this many hours. */
export const INTENTION_REQUEST_TTL_HOURS = 72;

export const introductionRequestStatusSchema = z.enum(["pending", "accepted"]);
export type IntroductionRequestStatus = z.infer<typeof introductionRequestStatusSchema>;

/**
 * A strong-basics values-only summary of the OTHER party. Reuses the discovery
 * profile projection (no name, photo, phone, or Telegram identity) and adds
 * the request id so the recipient can respond.
 */
export const introductionSummarySchema = z.object({
  /** The introduction request id (used to respond). */
  requestId: z.string().uuid(),
  /** The other party's values-only profile. */
  profile: discoveryProfileSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type IntroductionSummary = z.infer<typeof introductionSummarySchema>;

/** Incoming: pending requests addressed to the caller (sender's summary). */
export const incomingRequestsResponseSchema = z.object({
  requests: z.array(introductionSummarySchema),
});
export type IncomingRequestsResponse = z.infer<typeof incomingRequestsResponseSchema>;

/** Outgoing: the caller's sent requests. Declines are never returned. */
export const outgoingRequestItemSchema = z.object({
  requestId: z.string().uuid(),
  recipient: z.object({
    publicCode: publicProfileCodeSchema,
    age: z.number().int().min(18),
    city: z.string(),
    gender: z.enum(["female", "male"]),
  }),
  /** The sender only ever sees pending or accepted (never declined). */
  status: introductionRequestStatusSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type OutgoingRequestItem = z.infer<typeof outgoingRequestItemSchema>;

export const outgoingRequestsResponseSchema = z.object({
  requests: z.array(outgoingRequestItemSchema),
  /** Remaining request allowance in the current rolling 24h window. */
  remainingToday: z.number().int().min(0),
  dailyCap: z.number().int().min(1),
});
export type OutgoingRequestsResponse = z.infer<typeof outgoingRequestsResponseSchema>;

export const introductionRequestCreateSchema = z.object({
  targetPublicCode: publicProfileCodeSchema,
  idempotencyKey: z.string().uuid(),
});
export type IntroductionRequestCreate = z.infer<typeof introductionRequestCreateSchema>;

export const introductionRequestCreateResponseSchema = z.object({
  requestId: z.string().uuid(),
  status: introductionRequestStatusSchema,
  remainingToday: z.number().int().min(0),
  dailyCap: z.number().int().min(1),
});
export type IntroductionRequestCreateResponse = z.infer<typeof introductionRequestCreateResponseSchema>;

export const introductionRequestRespondSchema = z.object({
  accept: z.boolean(),
});
export type IntroductionRequestRespond = z.infer<typeof introductionRequestRespondSchema>;

export const introductionRequestRespondResponseSchema = z.object({
  requestId: z.string().uuid(),
  /** On accept, the id of the connection awaiting both participants' confirmation. */
  connectionId: z.string().uuid().nullable(),
  status: introductionRequestStatusSchema,
});
export type IntroductionRequestRespondResponse = z.infer<
  typeof introductionRequestRespondResponseSchema
>;
