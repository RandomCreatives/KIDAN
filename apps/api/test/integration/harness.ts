import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { createDatabasePool } from "../../src/database/pool.js";
import { applyMigrations } from "../../src/database/migrations.js";

export interface IntegrationHarness {
  pool: Pool;
  databaseName: string;
  /** Drops the disposable database and ends all pools. */
  cleanup: () => Promise<void>;
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Drops the named disposable database if it exists, using a short-lived admin pool.
 */
async function dropDatabase(baseUrl: string, databaseName: string): Promise<void> {
  const dropAdmin = new Pool({ connectionString: baseUrl, max: 1 });
  try {
    await dropAdmin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  } finally {
    await dropAdmin.end();
  }
}

/**
 * Creates a disposable PostgreSQL database, applies all migrations from zero,
 * and returns a pool bound to it. Safe to run several harnesses concurrently.
 * Drops the database if migrations fail so a failed run leaves no orphans.
 */
export async function createIntegrationHarness(): Promise<IntegrationHarness> {
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL must be set to run PostgreSQL integration tests");
  }
  const databaseName = `kidan_it_${randomBytes(4).toString("hex")}`;
  const admin = new Pool({ connectionString: baseUrl, max: 1 });
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await admin.end();
  }

  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  const pool = createDatabasePool(url.toString());
  try {
    const applied = await applyMigrations(pool, undefined);
    if (applied.length === 0) throw new Error("Integration harness applied no migrations");
  } catch (error) {
    await pool.end().catch(() => undefined);
    await dropDatabase(baseUrl, databaseName).catch(() => undefined);
    throw error;
  }

  return {
    pool,
    databaseName,
    cleanup: async () => {
      await pool.end();
      await dropDatabase(baseUrl, databaseName);
    },
  };
}