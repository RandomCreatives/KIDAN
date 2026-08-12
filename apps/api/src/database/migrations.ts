import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

export const migrationsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../database/migrations",
);

const migrationFilePattern = /^\d+_[a-z0-9_]+\.sql$/;

export async function applyMigrations(pool: Pool, directory = migrationsDirectory): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query("SELECT pg_advisory_lock(hashtext('kidan-schema-migrations'))");

    const files = (await readdir(directory))
      .filter((name) => migrationFilePattern.test(name))
      .sort();

    for (const name of files) {
      const sql = await readFile(resolve(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const recorded = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migration WHERE name = $1",
        [name],
      );

      if (recorded.rowCount) {
        if (recorded.rows[0]?.checksum !== checksum) {
          throw new Error(`Applied migration was modified: ${name}`);
        }
        continue;
      }

      await applyMigration(client, sql, name, checksum);
      applied.push(name);
    }

    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('kidan-schema-migrations'))").catch(() => undefined);
    client.release();
  }
}

async function applyMigration(client: PoolClient, sql: string, name: string, checksum: string): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)",
      [name, checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}