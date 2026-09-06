import { z } from "zod";
import { partialPublicOnboardingPayloadSchema } from "./onboarding.js";

/**
 * Self-serve data rights (B6): export and delete.
 *
 * The export bundle is returned only to the caller's OWN authenticated session
 * and includes data decrypted for that user (their identity, their verification
 * photo). It is never available to other candidates or in discovery.
 */

export const dataExportConsentSchema = z.object({
  purpose: z.string().min(1).max(80),
  policyVersion: z.string().min(1).max(32),
  granted: z.boolean(),
  recordedAt: z.string().datetime(),
});

export const dataExportResponseSchema = z.object({
  exportedAt: z.string().datetime(),
  publicCode: z.string().min(6).max(12),
  submitted: z.boolean(),
  /** The public profile / preferences exactly as they could appear in discovery. */
  publicProfile: partialPublicOnboardingPayloadSchema,
  /** Decrypted private identity, or null when the user never saved it. */
  identity: z
    .object({
      fullName: z.string().min(1).max(120),
      phoneNumber: z.string().min(4).max(24),
      dateOfBirth: z.string().min(6).max(20),
    })
    .nullable(),
  /** The candidate's own verification photo as a data URL, or null when absent/purged. */
  verificationPhoto: z
    .object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      dataUrl: z.string().startsWith("data:image/"),
    })
    .nullable(),
  /** Latest review status plus any private feedback note for this user. */
  review: z.object({
    status: z.enum(["pending", "approved", "changes_requested", "rejected"]),
    feedbackNote: z.string().max(2000).nullable(),
    decidedAt: z.string().datetime().nullable(),
  }),
  consents: z.array(dataExportConsentSchema),
});
export type DataExportResponse = z.infer<typeof dataExportResponseSchema>;

/** Account deletion requires an explicit confirmation flag. */
export const deleteAccountRequestSchema = z.object({
  confirm: z.literal(true),
});

export const deleteAccountResponseSchema = z.object({
  deleted: z.literal(true),
});
