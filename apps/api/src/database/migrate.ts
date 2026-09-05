import { loadLocalEnvironmentFile } from "../runtimeApp.js";
import { createDatabasePool } from "./pool.js";
import { applyMigrations } from "./migrations.js";

// The migration CLI is run from workspace contexts where the root `.env` is
// not in the working directory; load it (no-op on Vercel, which injects env).
loadLocalEnvironmentFile();

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
