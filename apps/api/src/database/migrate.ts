import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { createDatabasePool } from "./pool.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations");

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(here, "../../../../database/migrations");
const pool = createDatabasePool(databaseUrl);
let client: PoolClient | undefined;

try {
  client = await pool.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query("SELECT pg_advisory_lock(hashtext('kidan-schema-migrations'))");

  const files = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  for (const name of files) {
    const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await client.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migration WHERE name = $1",
      [name],
    );

    if (applied.rowCount) {
      if (applied.rows[0]?.checksum !== checksum) {
        throw new Error(`Applied migration was modified: ${name}`);
      }
      continue;
    }

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      console.info(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  if (client) {
    await client.query("SELECT pg_advisory_unlock(hashtext('kidan-schema-migrations'))").catch(() => undefined);
    client.release();
  }
  await pool.end();
}
