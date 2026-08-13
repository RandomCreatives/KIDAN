import { describe, expect, it } from "vitest";
import { mapErrorToStatus } from "./authState.js";

describe("mapErrorToStatus", () => {
  it("maps 401 UNAUTHENTICATED to expired", () => {
    expect(mapErrorToStatus("UNAUTHENTICATED", 401)).toBe("expired");
  });

  it("maps 403 ACCOUNT_UNAVAILABLE to unavailable", () => {
    expect(mapErrorToStatus("ACCOUNT_UNAVAILABLE", 403)).toBe("unavailable");
  });

  it("maps 403 INVALID_CSRF to fatal", () => {
    expect(mapErrorToStatus("INVALID_CSRF", 403)).toBe("fatal");
  });

  it("maps 503 REAL_SUBMISSIONS_DISABLED to unavailable", () => {
    expect(mapErrorToStatus("REAL_SUBMISSIONS_DISABLED", 503)).toBe("unavailable");
  });

  it("maps other 5xx to unavailable", () => {
    expect(mapErrorToStatus("INTERNAL_ERROR", 500)).toBe("unavailable");
  });

  it("maps other 4xx to fatal", () => {
    expect(mapErrorToStatus("INVALID_REQUEST", 400)).toBe("fatal");
  });
});
