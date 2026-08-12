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
