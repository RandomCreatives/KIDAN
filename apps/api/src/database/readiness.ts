import type { Pool } from "pg";

/**
 * Tables that must exist for the authentication and onboarding flow to work.
 * `SELECT 1` alone only proves a connection; a freshly provisioned database
 * answers it even when the schema migrations have never been applied, which
 * previously made `/ready` report healthy while the first login failed with a
 * 500 (missing relation). Verifying the catalog makes readiness meaningful.
 */
export const REQUIRED_TABLES = [
  "app_user",
  "identity_vault",
  "app_session",
  "onboarding_draft",
] as const;

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
  };
}
