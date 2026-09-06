import { randomBytes } from "node:crypto";
import type { PersistenceRepository, SessionRecord } from "../persistence/types.js";
import { generatePublicCode } from "../security/publicCode.js";
import { IdentityCipher, SecretHasher } from "../security/crypto.js";

export class SessionAccessError extends Error {
  constructor() {
    super("ACCOUNT_UNAVAILABLE");
    this.name = "SessionAccessError";
  }
}

export interface IssuedSession {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  profileStatus: SessionRecord["user"]["status"];
}

export class SessionService {
  constructor(
    private readonly repository: PersistenceRepository,
    private readonly identityCipher: IdentityCipher,
    private readonly sessionHasher: SecretHasher,
    private readonly ttlSeconds = 60 * 60,
  ) {}

  async issueForTelegramUser(telegramUserId: bigint, authDate: Date, now = new Date()): Promise<IssuedSession> {
    const telegramId = telegramUserId.toString();
    const user = await this.repository.findOrCreateUserByTelegram({
      telegramLookupHash: this.identityCipher.lookupHash(`telegram:${telegramId}`),
      telegramCiphertext: this.identityCipher.encrypt(telegramId, "telegram-id"),
      createPublicCode: generatePublicCode,
    });
    if (user.status === "suspended" || user.status === "deleted") throw new SessionAccessError();
    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = this.computeCsrf(sessionToken);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    await this.repository.createSession({
      userId: user.id,
      tokenHash: this.sessionHasher.hash(`session:${sessionToken}`),
      csrfTokenHash: this.sessionHasher.hash(`csrf:${csrfToken}`),
      telegramAuthDate: authDate,
      expiresAt,
    });

    return { sessionToken, csrfToken, expiresAt, profileStatus: user.status };
  }

  async authenticate(sessionToken: string | undefined, now = new Date()): Promise<SessionRecord | null> {
    if (!sessionToken || sessionToken.length > 128) return null;
    const tokenHash = this.sessionHasher.hash(`session:${sessionToken}`);
    const session = await this.repository.findActiveSession(tokenHash, now);
    if (!session) return null;
    if (session.user.status === "suspended" || session.user.status === "deleted") {
      await this.repository.revokeSession(tokenHash, now);
      return null;
    }
    await this.repository.touchSession(session.id, now);
    return session;
  }

  verifyCsrf(session: SessionRecord, csrfToken: string | undefined): boolean {
    return Boolean(csrfToken && csrfToken.length <= 128 && this.sessionHasher.matches(`csrf:${csrfToken}`, session.csrfTokenHash));
  }

  deriveCsrfToken(sessionToken: string | undefined): string | null {
    if (!sessionToken || sessionToken.length > 128) return null;
    return this.computeCsrf(sessionToken);
  }

  private computeCsrf(sessionToken: string): string {
    return this.sessionHasher.hash(`csrf:${sessionToken}`).toString("base64url");
  }

  async restoreSession(
    sessionToken: string | undefined,
    now = new Date(),
  ): Promise<{ csrfToken: string; profileStatus: SessionRecord["user"]["status"]; expiresAt: Date } | null> {
    const session = await this.authenticate(sessionToken, now);
    if (!session) return null;
    const csrfToken = this.deriveCsrfToken(sessionToken);
    if (!csrfToken) return null;
    return { csrfToken, profileStatus: session.user.status, expiresAt: session.expiresAt };
  }

  async revoke(sessionToken: string, now = new Date()): Promise<void> {
    await this.repository.revokeSession(this.sessionHasher.hash(`session:${sessionToken}`), now);
  }

  async revokeAllForUser(userId: string, now = new Date()): Promise<void> {
    await this.repository.revokeAllSessionsForUser(userId, now);
  }
}
