import { z } from "zod";

export const telegramAuthRequestSchema = z.object({
  initData: z.string().min(1).max(16_384),
});

export const sessionProfileStatusSchema = z.enum([
  "new",
  "identity_pending",
  "profile_pending",
  "active",
  "paused",
  "suspended",
]);

export const telegramAuthResponseSchema = z.object({
  authenticated: z.literal(true),
  csrfToken: z.string().min(32),
  profileStatus: sessionProfileStatusSchema,
  expiresAt: z.iso.datetime(),
});

export const sessionStatusSchema = z.object({
  authenticated: z.literal(true),
  csrfToken: z.string().min(32),
  profileStatus: sessionProfileStatusSchema,
  expiresAt: z.iso.datetime(),
});

export const apiErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNAUTHENTICATED",
  "ACCOUNT_UNAVAILABLE",
  "INVALID_CSRF",
  "INVALID_ORIGIN",
  "DRAFT_VERSION_CONFLICT",
  "REAL_SUBMISSIONS_DISABLED",
  "DRAFT_NOT_FOUND",
  "DRAFT_ALREADY_SUBMITTED",
  "IDENTITY_INCOMPLETE",
  "ADULT_ELIGIBILITY_REQUIRED",
  "INVALID_ONBOARDING_STATE",
  "MALFORMED_INIT_DATA",
  "INVALID_SIGNATURE",
  "STALE_INIT_DATA",
  "INVALID_USER",
  "NOT_FOUND",
  "INTERNAL_ERROR",
  "INVALID_RESPONSE",
  "SERVICE_NOT_READY",
]);

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  requestId: z.string().max(64),
  // Non-secret diagnostics, present only on initData rejection AND only when
  // the API exposes diagnostics (non-production runtimes). Always logged
  // server-side; never sent in production regardless of client debug mode.
  configuredBotId: z.string().max(32).optional(),
  tokenProbe: z.object({
    ok: z.boolean(),
    id: z.number().int().optional(),
    username: z.string().max(64).optional(),
    reason: z.string().max(120).optional(),
  }).optional(),
});

export const apiErrorEnvelopeSchema = z.object({ error: apiErrorSchema });

export type TelegramAuthRequest = z.infer<typeof telegramAuthRequestSchema>;
export type TelegramAuthResponse = z.infer<typeof telegramAuthResponseSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
