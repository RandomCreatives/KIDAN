import { describe, expect, it, vi } from "vitest";
import { createSchemaReadinessCheck, REQUIRED_TABLES } from "../src/database/readiness.js";

interface Row {
  table_name: string;
}

function fakePool(rows: Row[], shouldError?: Error): { pool: { query: ReturnType<typeof vi.fn> }; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async () => {
    if (shouldError) throw shouldError;
    return { rows };
  });
  return { pool: { query } as unknown as { query: typeof query }, query };
}

describe("schema readiness check", () => {
  it("resolves when every required table exists", async () => {
    const { pool, query } = fakePool(REQUIRED_TABLES.map((table_name) => ({ table_name })));
    const check = createSchemaReadinessCheck(pool as never);
    await expect(check()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects when a required table is missing (unmigrated database)", async () => {
    const partial = REQUIRED_TABLES.slice(0, 2).map((table_name) => ({ table_name }));
    const { pool } = fakePool(partial);
    const check = createSchemaReadinessCheck(pool as never);
    await expect(check()).rejects.toThrow(/not fully migrated/);
  });

  it("rejects when the database query itself fails", async () => {
    const { pool } = fakePool([], new Error("connect ECONNREFUSED"));
    const check = createSchemaReadinessCheck(pool as never);
    await expect(check()).rejects.toThrow(/ECONNREFUSED/);
  });
});
