import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";

describe("unconfigured persistence fallback", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("returns 503 SERVICE_NOT_READY on auth endpoints instead of 404", async () => {
    app = await buildApp(); // no botToken/sessionService -> persistence absent

    const session = await app.inject({ method: "GET", url: "/v1/session" });
    expect(session.statusCode).toBe(503);
    expect(session.json().error.code).toBe("SERVICE_NOT_READY");

    const auth = await app.inject({ method: "POST", url: "/v1/auth/telegram", payload: { initData: "x" } });
    expect(auth.statusCode).toBe(503);
    expect(auth.json().error.code).toBe("SERVICE_NOT_READY");
  });

  it("returns 503 SERVICE_NOT_READY on draft endpoints instead of 404", async () => {
    app = await buildApp();

    const getDraft = await app.inject({ method: "GET", url: "/v1/onboarding/draft" });
    expect(getDraft.statusCode).toBe(503);
    expect(getDraft.json().error.code).toBe("SERVICE_NOT_READY");

    const putDraft = await app.inject({ method: "PUT", url: "/v1/onboarding/draft", payload: {} });
    expect(putDraft.statusCode).toBe(503);
    expect(putDraft.json().error.code).toBe("SERVICE_NOT_READY");
  });
});
