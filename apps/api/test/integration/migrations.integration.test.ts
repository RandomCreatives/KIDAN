import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations, migrationsDirectory } from "../../src/database/migrations.js";
import { createIntegrationHarness, type IntegrationHarness } from "./harness.js";

describe("PostgreSQL migrations", () => {
  let harness: IntegrationHarness | undefined;
  beforeAll(async () => { harness = await createIntegrationHarness(); });
  afterAll(async () => harness?.cleanup());

  it("applies ordered migrations from a clean database and records SHA-256 checksums", async () => {
    if (!harness) throw new Error("integration harness not started");
    const recorded = await harness.pool.query<{ name: string; checksum: string }>(
      "SELECT name, checksum, char_length(checksum) AS len FROM schema_migration ORDER BY name",
    );
    expect(recorded.rows.map((row) => row.name)).toEqual([
      "0001_initial.sql",
      "0002_persistence_foundation.sql",
      "0003_verification_photo.sql",
    ]);
    for (const row of recorded.rows) {
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("re-running migrations is a safe no-op", async () => {
    if (!harness) throw new Error("integration harness not started");
    const applied = await applyMigrations(harness.pool);
    expect(applied).toEqual([]);
  });

  it("rejects a modified applied migration from a disposable copy", async () => {
    if (!harness) throw new Error("integration harness not started");
    const copyDir = await mkdtemp(join(tmpdir(), "kidan-migrations-"));
    await cp(migrationsDirectory, copyDir, { recursive: true });
    const tampered = join(copyDir, "0002_persistence_foundation.sql");
    const original = await readFile(tampered, "utf8");
    try {
      await writeFile(tampered, `${original}\n-- tampered disposable copy\n`);
      await expect(applyMigrations(harness.pool, copyDir)).rejects.toThrow(
        "Applied migration was modified: 0002_persistence_foundation.sql",
      );
    } finally {
      await writeFile(tampered, original);
    }
  });
});