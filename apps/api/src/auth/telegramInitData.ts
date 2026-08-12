import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  is_bot: z.boolean().optional(),
});

export type TelegramValidationErrorCode =
  | "MALFORMED_INIT_DATA"
  | "INVALID_SIGNATURE"
  | "STALE_INIT_DATA"
  | "INVALID_USER";

export class TelegramValidationError extends Error {
  constructor(public readonly code: TelegramValidationErrorCode) {
    super(code);
    this.name = "TelegramValidationError";
  }
}

export interface ValidatedTelegramPrincipal {
  telegramUserId: bigint;
  authDate: Date;
}

export interface ValidateTelegramInitDataOptions {
  botToken: string;
  maxAgeSeconds?: number;
  now?: Date;
}

export function validateTelegramInitData(
  initData: string,
  options: ValidateTelegramInitDataOptions,
): ValidatedTelegramPrincipal {
  if (!initData || initData.length > 16_384 || !options.botToken) {
    throw new TelegramValidationError("MALFORMED_INIT_DATA");
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDateRaw = params.get("auth_date");
  const userRaw = params.get("user");

  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash) || !authDateRaw || !userRaw) {
    throw new TelegramValidationError("MALFORMED_INIT_DATA");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(options.botToken)
    .digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();
  const receivedHashBytes = Buffer.from(receivedHash, "hex");

  if (receivedHashBytes.length !== expectedHash.length || !timingSafeEqual(receivedHashBytes, expectedHash)) {
    throw new TelegramValidationError("INVALID_SIGNATURE");
  }

  const authDateSeconds = Number(authDateRaw);
  if (!Number.isSafeInteger(authDateSeconds) || authDateSeconds <= 0) {
    throw new TelegramValidationError("MALFORMED_INIT_DATA");
  }

  const now = options.now ?? new Date();
  const maxAgeSeconds = options.maxAgeSeconds ?? 300;
  const ageSeconds = Math.floor(now.getTime() / 1000) - authDateSeconds;
  if (ageSeconds < -30 || ageSeconds > maxAgeSeconds) {
    throw new TelegramValidationError("STALE_INIT_DATA");
  }

  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(userRaw);
  } catch {
    throw new TelegramValidationError("INVALID_USER");
  }

  const userResult = telegramUserSchema.safeParse(parsedUser);
  if (!userResult.success || userResult.data.is_bot === true) {
    throw new TelegramValidationError("INVALID_USER");
  }

  return {
    telegramUserId: BigInt(userResult.data.id),
    authDate: new Date(authDateSeconds * 1000),
  };
}
