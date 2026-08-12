import { z } from "zod";

export const telegramAuthRequestSchema = z.object({
  initData: z.string().min(1).max(16_384),
});

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

export type TelegramAuthRequest = z.infer<typeof telegramAuthRequestSchema>;
export type SessionPrincipal = z.infer<typeof sessionPrincipalSchema>;
