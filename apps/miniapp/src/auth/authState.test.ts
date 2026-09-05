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

  it("keeps transient 5xx failures in the recoverable fatal state", () => {
    expect(mapErrorToStatus("INTERNAL_ERROR", 500)).toBe("fatal");
    expect(mapErrorToStatus("NETWORK", 502)).toBe("fatal");
  });

  it("maps 503 / SERVICE_NOT_READY to the service-unavailable state", () => {
    expect(mapErrorToStatus("SERVICE_NOT_READY", 503)).toBe("service_unavailable");
    expect(mapErrorToStatus("INTERNAL_ERROR", 503)).toBe("service_unavailable");
  });

  it("keeps NETWORK failures in the recoverable fatal state", () => {
    expect(mapErrorToStatus("NETWORK", 0)).toBe("fatal");
  });

  it("maps other 4xx to fatal", () => {
    expect(mapErrorToStatus("INVALID_REQUEST", 400)).toBe("fatal");
  });
});
