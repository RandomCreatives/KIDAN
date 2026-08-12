import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/environment.js";

describe("runtime environment", () => {
  it("uses safe development defaults with real submissions disabled", () => {
    expect(parseEnvironment({})).toMatchObject({
      NODE_ENV: "development",
      API_HOST: "0.0.0.0",
      API_PORT: 4000,
      ENABLE_REAL_SUBMISSIONS: "false",
    });
  });

  it("rejects partial persistence configuration and non-explicit feature flags", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "postgresql://localhost/kidan" })).toThrow();
    expect(() => parseEnvironment({ ENABLE_REAL_SUBMISSIONS: "yes" })).toThrow();
  });

  it("requires origin and persistence in production", () => {
    expect(() => parseEnvironment({ NODE_ENV: "production" })).toThrow();
  });
});
