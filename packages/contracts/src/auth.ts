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
  profileStatus: sessionProfileStatusSchema,
  expiresAt: z.iso.datetime(),
});

export type TelegramAuthRequest = z.infer<typeof telegramAuthRequestSchema>;
export type TelegramAuthResponse = z.infer<typeof telegramAuthResponseSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
