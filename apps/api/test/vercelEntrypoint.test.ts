import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Vercel Fastify entrypoint", () => {
  it("default-exports a Node serverless function handler", async () => {
    // app.ts runs top-level await to build the Fastify instance; allow enough
    // time for that initialization in the test environment (no DB connection
    // is made because the persistence env vars are absent).
    const entrypoint = await import("../src/app.js");

    expect(typeof entrypoint.default).toBe("function");
  }, 30_000);

  it("keeps a direct Fastify import in the recognized entrypoint", async () => {
    const source = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");

    expect(source).toMatch(/from ["']fastify["']/);
  });

  it("deploys as a Node serverless function, not a framework server", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;

    expect(config.framework).not.toBe("fastify");
    expect(config).not.toHaveProperty("outputDirectory");
  });
});
