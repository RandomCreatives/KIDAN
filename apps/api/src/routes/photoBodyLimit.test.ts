import { describe, expect, it } from "vitest";
import { buildApp } from "../appFactory.js";

// Regression test for the Track D e2e failure: the verification-photo route's
// bodyLimit was nested under `config` (where Fastify ignores it), so real
// photos (~3-5MB of base64 JSON) tripped the framework default (~1MB) and
// surfaced as a generic HTTP 500. The limit must be a top-level route option.
describe("verification-photo body limit", () => {
  const makeApp = async () => {
    const sessionService = {
      authenticate: async () => null,
      verifyCsrf: () => false,
    } as never;
    const onboardingService = {
      saveVerificationPhoto: async () => undefined,
      isRealSubmissionsEnabled: () => true,
    } as never;
    return buildApp({
      sessionService,
      onboardingService,
      botToken: "test-token",
      logger: false,
    });
  };

  it("accepts a realistic ~3MB photo body (reaches auth, not a body-limit 500)", async () => {
    const app = await makeApp();
    const dataUrl = `data:image/jpeg;base64,${"a".repeat(3_000_000)}`;
    const response = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/verification-photo",
      headers: { "content-type": "application/json" },
      payload: { dataUrl },
    });
    // Body parsed fine; unauthenticated stub session yields 401. Previously
    // this returned 500 INTERNAL_ERROR (FST_ERR_CTP_BODY_TOO_LARGE).
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
    await app.close();
  });

  it("returns 413 PHOTO_TOO_LARGE for a body over the route limit", async () => {
    const app = await makeApp();
    const dataUrl = `data:image/jpeg;base64,${"a".repeat(7_000_000)}`;
    const response = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/verification-photo",
      headers: { "content-type": "application/json" },
      payload: { dataUrl },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("PHOTO_TOO_LARGE");
    await app.close();
  });
});
