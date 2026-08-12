import type { SessionPrincipal } from "@kidan/contracts";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { AccountUnavailableError, type CreatedTelegramSession, type CreateTelegramSessionInput, type TelegramSessionStore } from "./sessionStore.js";
import {
  createPublicProfileCode,
  createSessionToken,
  encryptIdentityValue,
  hmacSha256,
  parseIdentityEncryptionKey,
} from "./privacyCrypto.js";

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_PROFILE_STATUSES: ReadonlySet<string> = new Set([
  "new",
  "identity_pending",
  "profile_pending",
  "active",
  "paused",
  "suspended",
]);

interface ExistingUserRow extends QueryResultRow {
  user_id: string;
  status: string;
}

interface InsertedUserRow extends QueryResultRow {
  id: string;
  status: string;
}

interface PersistedUserSessionSubject {
  userId: string;
  profileStatus: SessionPrincipal["profileStatus"];
}

export interface PostgresTelegramSessionStoreOptions {
  databaseUrl: string;
  identityEncryptionKey: Buffer;
  identityLookupPepper: string;
  sessionTokenPepper: string;
  sessionTtlSeconds?: number;
}

export class PostgresTelegramSessionStore implements TelegramSessionStore {
  private readonly pool: Pool;
  private readonly sessionTtlSeconds: number;

  constructor(private readonly options: PostgresTelegramSessionStoreOptions) {
    this.pool = new Pool({ connectionString: options.databaseUrl });
    this.sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  }

  async createTelegramSession(input: CreateTelegramSessionInput): Promise<CreatedTelegramSession> {
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTtlSeconds * 1000);
    const telegramUserId = input.telegramUserId.toString(10);
    const telegramLookupHash = hmacSha256(`telegram-user:${telegramUserId}`, this.options.identityLookupPepper);
    const sessionToken = createSessionToken();
    const sessionTokenHash = hmacSha256(`session-token:${sessionToken}`, this.options.sessionTokenPepper);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [telegramLookupHash.toString("hex")]);

      const subject = await this.findOrCreateUser(client, telegramUserId, telegramLookupHash);

      await client.query(
        `INSERT INTO app_session (user_id, session_token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [subject.userId, sessionTokenHash, expiresAt],
      );

      await client.query(
        `INSERT INTO audit_event (actor_type, actor_id, action, subject_type, subject_id, metadata_json)
         VALUES ('user', $1, 'auth.telegram_session_created', 'app_user', $1, '{}'::jsonb)`,
        [subject.userId],
      );

      await client.query("COMMIT");

      return {
        sessionToken,
        principal: {
          userId: subject.userId,
          profileStatus: subject.profileStatus,
          expiresAt: expiresAt.toISOString(),
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async findOrCreateUser(
    client: PoolClient,
    telegramUserId: string,
    telegramLookupHash: Buffer,
  ): Promise<PersistedUserSessionSubject> {
    const existing = await client.query<ExistingUserRow>(
      `SELECT app_user.id AS user_id, app_user.status
       FROM identity_vault
       JOIN app_user ON app_user.id = identity_vault.user_id
       WHERE identity_vault.telegram_id_lookup_hash = $1
       FOR UPDATE OF app_user, identity_vault`,
      [telegramLookupHash],
    );
    const existingRow = existing.rows.at(0);
    if (existingRow) {
      return {
        userId: existingRow.user_id,
        profileStatus: toSessionProfileStatus(existingRow.status),
      };
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const publicCode = createPublicProfileCode();
      const inserted = await client.query<InsertedUserRow>(
        `INSERT INTO app_user (public_code)
         VALUES ($1)
         ON CONFLICT (public_code) DO NOTHING
         RETURNING id, status`,
        [publicCode],
      );
      const insertedRow = inserted.rows.at(0);
      if (!insertedRow) {
        continue;
      }

      const telegramIdCiphertext = encryptIdentityValue(telegramUserId, this.options.identityEncryptionKey);
      await client.query(
        `INSERT INTO identity_vault (user_id, telegram_id_ciphertext, telegram_id_lookup_hash)
         VALUES ($1, $2, $3)`,
        [insertedRow.id, telegramIdCiphertext, telegramLookupHash],
      );

      await client.query(
        `INSERT INTO audit_event (actor_type, actor_id, action, subject_type, subject_id, metadata_json)
         VALUES ('service', NULL, 'app_user.created_from_telegram_auth', 'app_user', $1, '{}'::jsonb)`,
        [insertedRow.id],
      );

      return {
        userId: insertedRow.id,
        profileStatus: toSessionProfileStatus(insertedRow.status),
      };
    }

    throw new Error("Unable to allocate a unique public profile code");
  }
}

export function createPostgresSessionStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PostgresTelegramSessionStore | undefined {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    return undefined;
  }

  const identityEncryptionKeyRaw = env.IDENTITY_ENCRYPTION_KEY_BASE64;
  const identityLookupPepper = env.IDENTITY_LOOKUP_PEPPER;
  const sessionTokenPepper = env.SESSION_TOKEN_PEPPER;
  if (!identityEncryptionKeyRaw || !identityLookupPepper || !sessionTokenPepper) {
    throw new Error(
      "DATABASE_URL requires IDENTITY_ENCRYPTION_KEY_BASE64, IDENTITY_LOOKUP_PEPPER, and SESSION_TOKEN_PEPPER",
    );
  }

  const sessionTtlSeconds = parseOptionalPositiveInteger(env.API_SESSION_TTL_SECONDS, "API_SESSION_TTL_SECONDS");
  return new PostgresTelegramSessionStore({
    databaseUrl,
    identityEncryptionKey: parseIdentityEncryptionKey(identityEncryptionKeyRaw),
    identityLookupPepper,
    sessionTokenPepper,
    ...(sessionTtlSeconds === undefined ? {} : { sessionTtlSeconds }),
  });
}

function parseOptionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function toSessionProfileStatus(status: string): SessionPrincipal["profileStatus"] {
  if (SESSION_PROFILE_STATUSES.has(status)) {
    return status as SessionPrincipal["profileStatus"];
  }
  if (status === "deleted") {
    throw new AccountUnavailableError("Deleted accounts cannot create sessions");
  }
  throw new Error(`Unsupported account status from database: ${status}`);
}
