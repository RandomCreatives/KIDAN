import { z } from "zod";
import { publicProfileCodeSchema } from "./profile.js";

/**
 * Kidan Completion — the post-match pairing journey.
 *
 * Values-only by contract: the journey view NEVER carries names, phones, or
 * any identity material. The unveiled counterpart is the single exception —
 * it is only returned by the reveal endpoints, only after the simultaneous
 * reveal, and only to the two participants.
 */

export const pairingStageSchema = z.enum([
  "chatting",
  "revealed",
  "decoupled",
  "completed_together",
]);
export type PairingStage = z.infer<typeof pairingStageSchema>;

/** Snapshot of one side's journey, for the miniapp "Next step" surface. */
export const pairingJourneyViewSchema = z.object({
  connectionId: z.string().uuid(),
  stage: pairingStageSchema,
  /** The OTHER participant's K-code (values-only, always safe to render). */
  counterpartCode: publicProfileCodeSchema,
  gate: z.object({
    /** Both unlocks (age + exchanged messages) met — the readiness loop is open. */
    gateMet: z.boolean(),
    daysRemaining: z.number().int().min(0),
    messagesRemaining: z.number().int().min(0),
  }),
  readiness: z.object({
    selfReady: z.boolean(),
    otherReady: z.boolean(),
    primerStage: z.enum(["none", "awaiting_self", "awaiting_other"]),
    notYetCycles: z.number().int().min(0),
    /** ~A month of mutual "not yet" — the loop swaps to the reflection question. */
    zombieReflectionDue: z.boolean(),
  }),
  /** Gentle reminder sent — path needs attention. */
  stalled: z.boolean(),
  /** Serial-dater block: new picks are frozen until this path moves or closes. */
  blocked: z.boolean(),
});
export type PairingJourneyView = z.infer<typeof pairingJourneyViewSchema>;

export const pairingReadinessAnswerSchema = z.enum(["ready", "not_yet"]);
export type PairingReadinessAnswer = z.infer<typeof pairingReadinessAnswerSchema>;

export const pairingReadinessRequestSchema = z.object({
  answer: pairingReadinessAnswerSchema,
});
export type PairingReadinessRequest = z.infer<typeof pairingReadinessRequestSchema>;

export const pairingReadinessResultSchema = z.object({
  state: z.enum(["both_ready", "one_sided", "continue_chatting", "zombie_reflection"]),
});
export type PairingReadinessResult = z.infer<typeof pairingReadinessResultSchema>;

/** The unveiled counterpart — reveal payload (owner decision #1: full name + phone). */
export const revealedCounterpartSchema = z.object({
  publicCode: publicProfileCodeSchema,
  legalName: z.string().min(1),
  phone: z.string().min(1),
});
export type RevealedCounterpart = z.infer<typeof revealedCounterpartSchema>;

export const pairingConfirmResultSchema = z.object({
  revealed: z.literal(false),
});
export type PairingConfirmResult = z.infer<typeof pairingConfirmResultSchema>;

export const pairingRevealResultSchema = z.object({
  revealed: z.literal(true),
  counterpart: revealedCounterpartSchema,
});
export type PairingRevealResult = z.infer<typeof pairingRevealResultSchema>;

export const pairingCloseRequestSchema = z.object({
  /** Optional short note (≤120 chars, stored and shown to operators only). */
  reason: z.string().max(120).optional(),
});
export type PairingCloseRequest = z.infer<typeof pairingCloseRequestSchema>;

export const pairingCloseResultSchema = z.object({
  closed: z.literal(true),
  /** ISO timestamp of the scheduled +3d closing follow-up check-in. */
  followupDueAt: z.iso.datetime(),
});
export type PairingCloseResult = z.infer<typeof pairingCloseResultSchema>;

export const pairingTogetherResultSchema = z.object({
  completedTogether: z.literal(true),
});
export type PairingTogetherResult = z.infer<typeof pairingTogetherResultSchema>;
