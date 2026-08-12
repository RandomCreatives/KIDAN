import { z } from "zod";

export const telegramAuthRequestSchema = z.object({
  initData: z.string().min(1).max(16_384),
});

export const sessionTokenSchema = z
  .string()
  .regex(/^ks_[A-Za-z0-9_-]{43,128}$/, "Invalid opaque session token format");

export const sessionPrincipalSchema = z.object({
  userId: z.string().uuid(),
  profileStatus: z.enum([
    "new",
    "identity_pending",
    "profile_pending",
    "active",
    "paused",
    "suspended",
  ]),
  expiresAt: z.iso.datetime(),
});

export const telegramAuthSessionSchema = z.object({
  token: sessionTokenSchema,
  principal: sessionPrincipalSchema,
});

export const telegramAuthResponseSchema = z.object({
  data: z.object({
    validated: z.literal(true),
    requestId: z.string().uuid(),
    sessionReady: z.boolean(),
    session: telegramAuthSessionSchema.optional(),
  }),
});

export type TelegramAuthRequest = z.infer<typeof telegramAuthRequestSchema>;
export type SessionPrincipal = z.infer<typeof sessionPrincipalSchema>;
export type TelegramAuthSession = z.infer<typeof telegramAuthSessionSchema>;
export type TelegramAuthResponse = z.infer<typeof telegramAuthResponseSchema>;
