import { describe, expect, it } from "vitest";
import { buildApp } from "../appFactory.js";

// Regression: the operator admin console is served from a different origin
// than the candidate Mini App. The production API must accept state-changing
// (non-GET) requests from BOTH allowed origins; an admin login POST from the
// admin origin previously failed with 403 INVALID_ORIGIN.
describe("multi-origin allowlist", () => {
  const makeApp = async (allowedOrigins: string[]) =>
    buildApp({
      botToken: "test-token",
      sessionService: { authenticate: async () => null } as never,
      allowedOrigins,
      logger: false,
    });

  it("accepts a POST from either allowed origin (miniapp and admin)", async () => {
    const app = await makeApp([
      "https://kidan-staging-app.vercel.app",
      "https://kidan-staging-admin.vercel.app",
    ]);
    for (const origin of [
      "https://kidan-staging-app.vercel.app",
      "https://kidan-staging-admin.vercel.app",
    ]) {
      // A POST to an existing endpoint; no auth/body needed to pass the origin
      // gate — a 401 means the request was accepted and reached the route.
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/telegram",
        headers: { origin, "content-type": "application/json" },
        payload: {},
      });
      expect(response.statusCode).not.toBe(403);
      expect(response.json().error?.code).not.toBe("INVALID_ORIGIN");
    }
    await app.close();
  });

  it("rejects a POST from a disallowed origin with 403 INVALID_ORIGIN", async () => {
    const app = await makeApp([
      "https://kidan-staging-app.vercel.app",
      "https://kidan-staging-admin.vercel.app",
    ]);
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("INVALID_ORIGIN");
    await app.close();
  });

  it("still supports the legacy single allowedOrigin option", async () => {
    const app = await buildApp({
      botToken: "test-token",
      sessionService: { authenticate: async () => null } as never,
      allowedOrigin: "https://kidan.app",
      logger: false,
    });
    const allowed = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      headers: { origin: "https://kidan.app", "content-type": "application/json" },
      payload: {},
    });
    expect(allowed.statusCode).not.toBe(403);
    const denied = await app.inject({
      method: "POST",
      url: "/v1/auth/telegram",
      headers: { origin: "https://kidan-staging-admin.vercel.app", "content-type": "application/json" },
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("INVALID_ORIGIN");
    await app.close();
  });
});
