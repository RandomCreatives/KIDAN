import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/environment.js";

describe("runtime environment", () => {
  it("uses safe development defaults with real submissions disabled", () => {
    expect(parseEnvironment({})).toMatchObject({
      NODE_ENV: "development",
      API_HOST: "0.0.0.0",
      API_PORT: 4000,
      ENABLE_REAL_SUBMISSIONS: "false",
      PILOT_CAPACITY: 100,
    });
  });

  it("rejects partial persistence configuration and non-explicit feature flags", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "postgresql://localhost/kidan" })).toThrow();
    expect(() => parseEnvironment({ ENABLE_REAL_SUBMISSIONS: "yes" })).toThrow();
  });

  it("requires origin and persistence in production", () => {
    expect(() => parseEnvironment({ NODE_ENV: "production" })).toThrow();
  });

  it("still requires full config on a real Vercel production deployment", () => {
    expect(() => parseEnvironment({ NODE_ENV: "production", VERCEL_ENV: "production" })).toThrow();
  });

  it("allows a Vercel preview deployment (NODE_ENV=production, no secrets) to boot", () => {
    // Preview branch deployments run with NODE_ENV=production but do not receive
    // the production-scoped secrets. They must boot into not-ready mode instead
    // of failing strict-config validation on cold start.
    const env = parseEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview" });
    expect(env.NODE_ENV).toBe("production");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.APP_ORIGIN).toBeUndefined();
  });
});
