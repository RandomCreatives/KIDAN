import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.js";
import { resolveSession } from "./sessionBootstrap.js";
import type { SessionStatus, TelegramAuthResponse } from "@kidan/contracts";

function session(csrf = "x".repeat(43)): SessionStatus {
  return { authenticated: true, csrfToken: csrf, profileStatus: "new", expiresAt: new Date().toISOString() };
}
function issued(csrf = "x".repeat(43)): TelegramAuthResponse {
  return { authenticated: true, csrfToken: csrf, profileStatus: "new", expiresAt: new Date().toISOString() };
}

describe("resolveSession", () => {
  it("returns authenticated when the existing session restores", async () => {
    const deps = {
      getSession: vi.fn().mockResolvedValue(session()),
      authenticateWithTelegram: vi.fn(),
      getInitData: vi.fn().mockReturnValue("init"),
    };
    const result = await resolveSession(deps);
    expect(result).toEqual({ kind: "authenticated", csrfToken: "x".repeat(43), profileStatus: "new" });
    expect(deps.authenticateWithTelegram).not.toHaveBeenCalled();
  });

  it("exchanges init data when the session is missing and init data is present", async () => {
    let authenticated = false;
    const deps = {
      getSession: vi.fn().mockRejectedValue(new ApiError("UNAUTHENTICATED", 401)),
      authenticateWithTelegram: vi.fn().mockResolvedValue(issued()),
      getInitData: vi.fn().mockReturnValue("init"),
      onAuthenticating: () => {
        authenticated = true;
      },
    };
    const result = await resolveSession(deps);
    expect(authenticated).toBe(true);
    expect(result).toEqual({ kind: "authenticated", csrfToken: "x".repeat(43), profileStatus: "new" });
  });

  it("reports unauthenticated when there is no session and no init data", async () => {
    const deps = {
      getSession: vi.fn().mockRejectedValue(new ApiError("UNAUTHENTICATED", 401)),
      authenticateWithTelegram: vi.fn(),
      getInitData: vi.fn().mockReturnValue(""),
    };
    const result = await resolveSession(deps);
    expect(result).toEqual({ kind: "unauthenticated" });
    expect(deps.authenticateWithTelegram).not.toHaveBeenCalled();
  });

  it("does not start Telegram authentication after lifecycle cancellation", async () => {
    const deps = {
      getSession: vi.fn().mockRejectedValue(new ApiError("UNAUTHENTICATED", 401)),
      authenticateWithTelegram: vi.fn().mockResolvedValue(issued()),
      getInitData: vi.fn().mockReturnValue("init"),
      canAuthenticate: vi.fn().mockReturnValue(false),
      onAuthenticating: vi.fn(),
    };
    const result = await resolveSession(deps);
    expect(result).toEqual({ kind: "unauthenticated" });
    expect(deps.authenticateWithTelegram).not.toHaveBeenCalled();
    expect(deps.onAuthenticating).not.toHaveBeenCalled();
  });

  it("reports unavailable when the account cannot authenticate", async () => {
    const deps = {
      getSession: vi.fn().mockRejectedValue(new ApiError("UNAUTHENTICATED", 401)),
      authenticateWithTelegram: vi.fn().mockRejectedValue(new ApiError("ACCOUNT_UNAVAILABLE", 403)),
      getInitData: vi.fn().mockReturnValue("init"),
    };
    const result = await resolveSession(deps);
    expect(result).toEqual({ kind: "unavailable" });
  });

  it("maps transient server errors to a recoverable fatal status", async () => {
    const deps = {
      getSession: vi.fn().mockRejectedValue(new ApiError("INTERNAL_ERROR", 500)),
      authenticateWithTelegram: vi.fn(),
      getInitData: vi.fn().mockReturnValue(""),
    };
    const result = await resolveSession(deps);
    expect(result).toMatchObject({ kind: "error", status: "fatal" });
    expect((result as { detail?: string }).detail).toMatch(/INTERNAL_ERROR/);
  });

  it("leaves a stale concurrent result to the caller (single-flight at the component)", async () => {
    const slow = new Promise<SessionStatus>((resolve) => setTimeout(() => resolve(session()), 20));
    const deps = {
      getSession: vi.fn().mockReturnValue(slow),
      authenticateWithTelegram: vi.fn(),
      getInitData: vi.fn().mockReturnValue(""),
    };
    const [a, b] = await Promise.all([resolveSession(deps), resolveSession(deps)]);
    expect(a).toEqual(b);
    expect(a).toEqual({ kind: "authenticated", csrfToken: "x".repeat(43), profileStatus: "new" });
  });
});
