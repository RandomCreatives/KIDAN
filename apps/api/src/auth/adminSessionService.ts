import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Administrator console authentication.
 *
 * Deliberately separate from candidate (Telegram Mini App) sessions:
 *  - candidates authenticate via Telegram initData; admins via a single
 *    operator password secret (ADMIN_CONSOLE_PASSWORD) provisioned out-of-band;
 *  - admin state never reuses the candidate cookie or the app_session table.
 *
 * The pilot operator password is verified with an HMAC comparison (constant
 * time) against the configured secret. A successful login issues a stateless,
 * HMAC-signed session token stored in an HttpOnly cookie; a derived CSRF token
 * guards state-changing requests. Stateless sessions keep the admin surface
 * simple and add no candidate-adjacent persistence.
 */
export class AdminSessionService {
  private readonly passwordHash: Buffer;
  private readonly ttlMs: number;
  readonly label: string;

  constructor(
    private readonly secretKey: Buffer,
    password: string,
    options: { ttlSeconds?: number; label?: string } = {},
  ) {
    // Hash the password with a domain-separated HMAC; compare digests in
    // constant time so the raw secret is never held in a comparable string.
    this.passwordHash = createHmac("sha256", secretKey).update(`admin-password:${password}`).digest();
    this.ttlMs = (options.ttlSeconds ?? 4 * 60 * 60) * 1000;
    this.label = options.label ?? "Pilot Administrator";
  }

  isEnabled(): boolean {
    return true;
  }

  /** Constant-time verification of the submitted password. */
  verifyPassword(submitted: string): boolean {
    if (typeof submitted !== "string" || submitted.length === 0 || submitted.length > 256) return false;
    const candidate = createHmac("sha256", this.secretKey).update(`admin-password:${submitted}`).digest();
    return candidate.length === this.passwordHash.length && timingSafeEqual(candidate, this.passwordHash);
  }

  /** Issues a signed session token and a derived CSRF token. */
  issue(now = new Date()): { sessionToken: string; csrfToken: string; expiresAt: Date } {
    const nonce = randomBytes(16).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const payload = `${expiresAt.getTime()}.${nonce}`;
    const signature = this.sign(`admin-session:${payload}`);
    const sessionToken = `${payload}.${signature}`;
    const csrfToken = this.sign(`admin-csrf:${payload}`);
    return { sessionToken, csrfToken, expiresAt };
  }

  /** Validates a session token's signature and expiry. Returns the CSRF token when valid. */
  authenticate(sessionToken: string | undefined, now = new Date()): { csrfToken: string; expiresAt: Date } | null {
    if (typeof sessionToken !== "string" || sessionToken.length > 512) return null;
    const parts = sessionToken.split(".");
    if (parts.length !== 3) return null;
    const [expiresMs, nonce, signature] = parts;
    if (!expiresMs || !nonce || !signature) return null;
    const payload = `${expiresMs}.${nonce}`;
    const expected = Buffer.from(this.sign(`admin-session:${payload}`));
    const provided = Buffer.from(signature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const expiresAtTime = Number(expiresMs);
    if (!Number.isFinite(expiresAtTime)) return null;
    const expiresAt = new Date(expiresAtTime);
    if (expiresAt.getTime() <= now.getTime()) return null;
    return { csrfToken: this.sign(`admin-csrf:${payload}`), expiresAt };
  }

  verifyCsrf(sessionToken: string | undefined, csrfToken: string | undefined, now = new Date()): boolean {
    const session = this.authenticate(sessionToken, now);
    if (!session || typeof csrfToken !== "string" || csrfToken.length > 128) return false;
    const expected = Buffer.from(session.csrfToken);
    const provided = Buffer.from(csrfToken);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  private sign(value: string): string {
    return createHmac("sha256", this.secretKey).update(value).digest("base64url");
  }
}
