import { Buffer } from "node:buffer";
import type { Pool } from "pg";

/**
 * Tables touched by the authentication write path.
 */
export const REQUIRED_TABLES = [
  "app_user",
  "identity_vault",
  "app_session",
  "onboarding_draft",
] as const;

/**
 * Readiness probe for the authenticated write path.
 *
 * `SELECT 1` and an information_schema existence check only prove a connection
 * and that the tables exist; they do NOT prove that the current role can
 * INSERT, that the primary-key default `gen_random_uuid()` is usable, or that
 * the columns match the schema the application expects. A provisioned,
 * read-only, or hand-built (divergent) database therefore answered /ready
 * green and then failed the first login with an opaque 500 — which the mini
 * app rendered as "Connection error".
 *
 * This probe is strictly non-mutating: it checks table presence and then runs
 * the exact login insert shape (app_user -> identity_vault -> app_session)
 * inside a transaction that is always rolled back. No rows are persisted.
 */
export function createSchemaReadinessCheck(pool: Pool): () => Promise<void> {
  return async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES as unknown as string[]],
    );
    if (rows.length !== REQUIRED_TABLES.length) {
      throw new Error("database schema is not fully migrated");
    }

    const dummy = Buffer.alloc(32, 0x0a);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO app_user (public_code) VALUES ($1) RETURNING id`,
        ["KD-ABCDEF"],
      );
      const userId = inserted.rows[0]?.id;
      if (!userId) throw new Error("could not insert app_user row");
      await client.query(
        `INSERT INTO identity_vault (user_id, telegram_id_ciphertext, telegram_id_lookup_hash)
         VALUES ($1, $2, $3)`,
        [userId, dummy, dummy],
      );
      await client.query(
        `INSERT INTO app_session (user_id, token_hash, csrf_token_hash, telegram_auth_date, expires_at)
         VALUES ($1, $2, $3, now(), now() + interval '1 hour')`,
        [userId, dummy, dummy],
      );
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };
}
