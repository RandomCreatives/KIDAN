import { createDatabasePool } from "./pool.js";
import { applyMigrations } from "./migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations");

const pool = createDatabasePool(databaseUrl);

try {
  for (const name of await applyMigrations(pool)) {
    console.info(`Applied ${name}`);
  }
} finally {
  await pool.end();
}