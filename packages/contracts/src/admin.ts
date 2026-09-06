import { z } from "zod";
import { publicOnboardingPayloadSchema } from "./onboarding.js";

/**
 * Admin review console contract.
 *
 * The admin console is a separate, password-protected operator surface. It is
 * intentionally NOT part of the Mini App and never shares a session with
 * candidates. Decryption of private details (name, phone, date of birth,
 * verification photo) happens only through these admin-authenticated endpoints.
 */

export const adminLoginRequestSchema = z.object({
  password: z.string().min(1).max(256),
});

export const adminSessionSchema = z.object({
  authenticated: z.literal(true),
  csrfToken: z.string().min(16),
  /** Operator display label, e.g. "Pilot Administrator". */
  label: z.string().min(1).max(80),
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminReviewDecisionSchema = z.enum(["approved", "rejected", "changes_requested"]);
export type AdminReviewDecision = z.infer<typeof adminReviewDecisionSchema>;

/** Candidate summary row for the review queue. No decrypted identity here. */
export const adminQueueItemSchema = z.object({
  /** Public code (KD-XXXXXX) — the only candidate identifier shown in lists. */
  publicCode: z.string().min(6).max(12),
  gender: z.enum(["female", "male"]),
  city: z.string().min(1).max(80),
  age: z.number().int().min(18).max(120),
  submittedAt: z.string().datetime(),
  reviewStatus: z.enum(["pending", "approved", "rejected", "changes_requested"]),
  hasPhoto: z.boolean(),
});
export type AdminQueueItem = z.infer<typeof adminQueueItemSchema>;

export const adminQueueResponseSchema = z.object({
  items: z.array(adminQueueItemSchema),
});

/** Decrypted private identity, visible only on the detail view. */
export const adminIdentitySchema = z.object({
  fullName: z.string().min(1).max(120),
  phoneNumber: z.string().min(4).max(24),
  dateOfBirth: z.string().min(6).max(20),
});

export const adminReviewHistoryItemSchema = z.object({
  decision: adminReviewDecisionSchema,
  reasonCode: z.string().max(60).nullable(),
  /** Decrypted feedback note, or null when none was left. */
  note: z.string().max(2000).nullable(),
  decidedAt: z.string().datetime(),
});

export const adminSubmissionDetailSchema = z.object({
  publicCode: z.string().min(6).max(12),
  status: z.enum(["profile_pending", "active", "paused", "suspended"]),
  submittedAt: z.string().datetime(),
  publicPayload: publicOnboardingPayloadSchema,
  identity: adminIdentitySchema,
  hasPhoto: z.boolean(),
  reviewStatus: z.enum(["pending", "approved", "rejected", "changes_requested"]),
  history: z.array(adminReviewHistoryItemSchema),
});
export type AdminSubmissionDetail = z.infer<typeof adminSubmissionDetailSchema>;

export const adminDecisionRequestSchema = z.object({
  decision: adminReviewDecisionSchema,
  reasonCode: z.string().trim().max(60).optional(),
  /** Optional encrypted feedback note (plaintext in transit over HTTPS). */
  note: z.string().trim().max(2000).optional(),
});
export type AdminDecisionRequest = z.infer<typeof adminDecisionRequestSchema>;

export const adminDecisionResponseSchema = z.object({
  decision: adminReviewDecisionSchema,
  reviewStatus: z.enum(["approved", "rejected", "changes_requested"]),
});

/** Verification photo as a data URL for the detail view. */
export const adminPhotoResponseSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataUrl: z.string().startsWith("data:image/"),
});

/**
 * Candidate-facing review status (B4). Returned only for the caller's OWN
 * session, so it never exposes another candidate. The feedback note is the
 * administrator's message written for this candidate; no other identity is
 * included.
 */
export const candidateReviewStatusSchema = z.object({
  status: z.enum(["pending", "approved", "changes_requested", "rejected"]),
  /** Decrypted feedback note for the candidate; null until an admin writes one. */
  feedbackNote: z.string().max(2000).nullable(),
  decidedAt: z.string().datetime().nullable(),
});
export type CandidateReviewStatus = z.infer<typeof candidateReviewStatusSchema>;
