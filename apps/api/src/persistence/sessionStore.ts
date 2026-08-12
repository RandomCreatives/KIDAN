import type { SessionPrincipal } from "@kidan/contracts";

export interface CreateTelegramSessionInput {
  telegramUserId: bigint;
  authDate: Date;
  now?: Date;
}

export interface CreatedTelegramSession {
  sessionToken: string;
  principal: SessionPrincipal;
}

export interface TelegramSessionStore {
  createTelegramSession(input: CreateTelegramSessionInput): Promise<CreatedTelegramSession>;
  close?(): Promise<void>;
}

export class AccountUnavailableError extends Error {
  constructor(message = "Account is unavailable for session creation") {
    super(message);
    this.name = "AccountUnavailableError";
  }
}
