import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("health route", () => {
  it("responds on root GET and /health without cacheable or sensitive data", async () => {
    const app = await buildApp();
    apps.push(app);
    const rootResponse = await app.inject({ method: "GET", url: "/" });
    expect(rootResponse.statusCode).toBe(200);
    expect(rootResponse.json().data.status).toBe("ok");

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json().data.status).toBe("ok");
  });

  it("reports dependency readiness without leaking the dependency error", async () => {
    const app = await buildApp({ readinessCheck: async () => { throw new Error("database hostname secret"); } });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("SERVICE_NOT_READY");
    expect(response.body).not.toContain("hostname");
  });
});
