import { z } from "zod";
import { publicProfileCodeSchema } from "./profile.js";

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
