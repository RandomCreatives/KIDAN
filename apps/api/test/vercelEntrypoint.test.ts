import { readFile } from "node:fs/promises";
import { Server } from "node:http";
import { describe, expect, it } from "vitest";

describe("Vercel Fastify entrypoint", () => {
  it("default-exports the configured Node server from the recognized app module", async () => {
    const entrypoint = await import("../src/app.js");

    expect(entrypoint.default).toBeInstanceOf(Server);
  });

  it("keeps Fastify zero-configuration detection enabled", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;

    expect(config.framework).toBe("fastify");
    expect(config).not.toHaveProperty("buildCommand");
    expect(config).not.toHaveProperty("outputDirectory");
  });
});