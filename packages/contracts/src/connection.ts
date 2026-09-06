import { z } from "zod";
import { discoveryProfileSchema, publicProfileCodeSchema } from "./profile.js";

export const connectionStatusSchema = z.enum([
  "interested_by_one",
  "mutual_pending_admin",
  "admin_rejected",
  "admin_approved_pending_confirmation",
  "connected",
  "declined",
  "blocked",
  "closed",
]);

export const discoveryDecisionSchema = z.object({
  targetPublicCode: publicProfileCodeSchema,
  decision: z.enum(["pass", "interested"]),
  idempotencyKey: z.string().uuid(),
});

export const connectionSummarySchema = z.object({
  id: z.string().uuid(),
  profile: z.object({
    publicCode: publicProfileCodeSchema,
    age: z.number().int().min(18),
    city: z.string(),
  }),
  status: connectionStatusSchema,
  updatedAt: z.iso.datetime(),
});

export const contactRevealGateSchema = z.object({
  mutualInterest: z.literal(true),
  adminApproved: z.literal(true),
  userConfirmed: z.literal(true),
  otherUserConfirmed: z.literal(true),
});

export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type DiscoveryDecision = z.infer<typeof discoveryDecisionSchema>;

// --- Track D: admin-gated connections ---

/** A connection as shown to a participant (values-only; never identity). */
export const connectionItemSchema = z.object({
  id: z.string().uuid(),
  status: connectionStatusSchema,
  /** The OTHER participant's values-only public projection. */
  other: z.object({
    publicCode: publicProfileCodeSchema,
    age: z.number().int().min(18),
    city: z.string(),
    gender: z.enum(["female", "male"]),
  }),
  /** Whether the calling user has recorded their final confirmation. */
  iConfirmed: z.boolean(),
  /** Whether the other participant has confirmed. */
  theyConfirmed: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type ConnectionItem = z.infer<typeof connectionItemSchema>;

export const connectionListResponseSchema = z.object({
  connections: z.array(connectionItemSchema),
});
export type ConnectionListResponse = z.infer<typeof connectionListResponseSchema>;

export const connectionConfirmRequestSchema = z.object({
  confirm: z.boolean(),
});

export const connectionConfirmResponseSchema = z.object({
  status: connectionStatusSchema,
});
export type ConnectionConfirmResponse = z.infer<typeof connectionConfirmResponseSchema>;

/** Admin view of a connection awaiting administrator approval. */
export const adminPendingConnectionSchema = z.object({
  id: z.string().uuid(),
  userA: z.object({ publicCode: publicProfileCodeSchema, age: z.number().int().min(18), city: z.string(), gender: z.enum(["female", "male"]) }),
  userB: z.object({ publicCode: publicProfileCodeSchema, age: z.number().int().min(18), city: z.string(), gender: z.enum(["female", "male"]) }),
  createdAt: z.iso.datetime(),
});
export type AdminPendingConnection = z.infer<typeof adminPendingConnectionSchema>;

export const adminPendingConnectionListSchema = z.object({
  connections: z.array(adminPendingConnectionSchema),
});

export const adminConnectionDecisionRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export const adminConnectionDecisionResponseSchema = z.object({
  id: z.string().uuid(),
  status: connectionStatusSchema,
});
export type AdminConnectionDecisionResponse = z.infer<typeof adminConnectionDecisionResponseSchema>;

// --- Track D3: restricted in-app introduction ---
//
// After a connection reaches 'connected' the two participants may exchange
// short, moderated text introductions INSIDE the app. The wire surface stays
// values-only: the other party is represented by their discovery profile
// values, and messages must not contain contact details (the server screens
// for phone numbers, Telegram handles, and URLs).

export const introductionMessageSchema = z.object({
  id: z.string().uuid(),
  /** True when the message was sent by the requesting user. */
  fromMe: z.boolean(),
  /** Empty when hidden by an administrator (the original is retained server-side for audit). */
  body: z.string().max(600),
  createdAt: z.iso.datetime(),
  /** True when an administrator hid the message (body blanked for both users). */
  hidden: z.boolean(),
});
export type IntroductionMessage = z.infer<typeof introductionMessageSchema>;

export const introductionThreadResponseSchema = z.object({
  connectionId: z.string().uuid(),
  /** The other participant's values-only public profile (never identity). */
  other: discoveryProfileSchema,
  messages: z.array(introductionMessageSchema),
});
export type IntroductionThread = z.infer<typeof introductionThreadResponseSchema>;

export const introductionPostRequestSchema = z.object({
  body: z.string().trim().min(1).max(600),
});
export type IntroductionPostRequest = z.infer<typeof introductionPostRequestSchema>;

export const introductionPostResponseSchema = z.object({
  message: introductionMessageSchema,
});

// Track D3: admin moderation view of the restricted introduction channel.
export const adminIntroductionMessageSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  senderPublicCode: z.string(),
  body: z.string().max(600),
  hidden: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AdminIntroductionMessage = z.infer<typeof adminIntroductionMessageSchema>;

export const adminIntroductionListSchema = z.object({
  messages: z.array(adminIntroductionMessageSchema),
});
