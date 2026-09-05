import { describe, expect, it, vi } from "vitest";
import { createSchemaReadinessCheck, REQUIRED_TABLES } from "../src/database/readiness.js";

interface QueryResult {
  rows: Record<string, unknown>[];
}

/**
 * Builds a fake pool. `catalog` controls the information_schema result;
 * `onQuery` can throw to simulate a failing write/permission. The connect()
 * client collects the statements issued so tests can assert the rollback.
 */
function fakePool(opts: { catalog?: number; failOn?: RegExp }): {
  pool: unknown;
  statements: string[];
} {
  const statements: string[] = [];
  const run = async (text: string): Promise<QueryResult> => {
    statements.push(text);
    if (opts.failOn && opts.failOn.test(text)) throw new Error("simulated failure");
    if (/information_schema\.tables/.test(text)) {
      const rows = Array.from({ length: opts.catalog ?? REQUIRED_TABLES.length }, (_, i) => ({
        table_name: REQUIRED_TABLES[i],
      }));
      return { rows };
    }
    if (/INSERT INTO app_user/.test(text)) return { rows: [{ id: "00000000-0000-0000-0000-000000000001" }] };
    return { rows: [] };
  };
  const client = {
    query: vi.fn((text: string) => run(text)),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn((text: string) => run(text)),
    connect: vi.fn(async () => client),
  };
  return { pool, statements };
}

describe("schema readiness check", () => {
  it("resolves when tables exist and the login write shape succeeds (and rolls back)", async () => {
    const { pool, statements } = fakePool({});
    const check = createSchemaReadinessCheck(pool as never);
    await expect(check()).resolves.toBeUndefined();
    expect(statements.some((s) => s.includes("BEGIN"))).toBe(true);
    expect(statements.some((s) => s.includes("ROLLBACK"))).toBe(true);
    expect(statements.some((s) => s.includes("INSERT INTO identity_vault"))).toBe(true);
    expect(statements.some((s) => s.includes("INSERT INTO app_session"))).toBe(true);
    // Never commits -> no persisted readiness rows.
    expect(statements.some((s) => s.trim() === "COMMIT")).toBe(false);
  });

  it("rejects when a required table is missing (unmigrated database)", async () => {
    const { pool } = fakePool({ catalog: 2 });
    const check = createSchemaReadinessCheck(pool as never);
    await expect(check()).rejects.toThrow(/not fully migrated/);
  });

  it("rejects (and rolls back) when the login insert fails, e.g. read-only role or divergent DDL", async () => {
    const { pool, statements } = fakePool({ failOn: /INSERT INTO app_user/ });
    const check = createSchemaReadinessCheck(pool as never);
    await expect(check()).rejects.toThrow(/simulated failure/);
    expect(statements.filter((s) => s.includes("ROLLBACK")).length).toBeGreaterThanOrEqual(1);
  });
});
