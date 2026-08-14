// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, type LogoutResult } from "./AuthProvider.js";
import { useAuth } from "./useAuth.js";

const CSRF_A = "a".repeat(43);
const CSRF_B = "b".repeat(43);

function setTelegram(initData: string): void {
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData } };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function apiError(code: string, status = 400): Response {
  return json({ error: { code, requestId: "req_test1234567890" } }, status);
}

function sessionUnauthenticated(): Response {
  return apiError("UNAUTHENTICATED", 401);
}

function sessionOk(csrfToken = CSRF_A): Response {
  return json({
    data: {
      authenticated: true,
      csrfToken,
      profileStatus: "active",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
}

function telegramOk(csrfToken = CSRF_A): Response {
  return json({
    data: {
      authenticated: true,
      csrfToken,
      profileStatus: "new",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
}

function csrfHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.["x-csrf-token"];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("AuthProvider", () => {
  beforeEach(() => {
    setTelegram("valid-init-data");
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (window as unknown as { Telegram?: unknown }).Telegram = undefined;
    window.sessionStorage.clear();
  });

  it("authenticates through bound client methods (R2-01)", async () => {
    const fetchImpl = vi.fn((input: string) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      return Promise.resolve(json({}));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.csrfToken).toBe(CSRF_A);
  });

  it("shares one in-flight bootstrap across concurrent retry callers", async () => {
    const pendingSession = deferred<Response>();
    const fetchImpl = vi.fn((input: string) => {
      if (input.includes("/v1/session")) return pendingSession.promise;
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      return Promise.resolve(json({}));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    let first!: ReturnType<typeof result.current.retry>;
    let second!: ReturnType<typeof result.current.retry>;
    act(() => {
      first = result.current.retry();
      second = result.current.retry();
    });
    expect(first).toBe(second);
    await waitFor(() => {
      expect(fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/session"))).toHaveLength(1);
    });

    await act(async () => pendingSession.resolve(sessionUnauthenticated()));
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/auth/telegram"))).toHaveLength(1);
  });

  it("makes invalidation awaitable and clears local state", async () => {
    globalThis.fetch = vi.fn((input: string) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionOk());
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    await act(async () => result.current.invalidate());
    expect(result.current.status).toBe("expired");
    expect(result.current.csrfToken).toBeNull();
  });

  describe("truthful final-session logout", () => {
    it("uses the final GET token and signs out only after 204", async () => {
      let sessionGets = 0;
      const logoutHeaders: string[] = [];
      const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
        if (input.includes("/v1/session/logout")) {
          logoutHeaders.push(csrfHeader(init) ?? "");
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (input.includes("/v1/session")) {
          sessionGets += 1;
          return Promise.resolve(sessionOk(sessionGets === 1 ? CSRF_A : CSRF_B));
        }
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let outcome!: LogoutResult;
      await act(async () => {
        outcome = await result.current.logout();
      });
      expect(outcome).toEqual({ success: true, reason: "revoked" });
      expect(logoutHeaders).toEqual([CSRF_B]);
      expect(result.current.status).toBe("unauthenticated");
      expect(result.current.csrfToken).toBeNull();
      expect(result.current.logoutError).toBeNull();
    });

    it("revokes from the final server session when sessionStorage is unavailable", async () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("storage blocked", "SecurityError");
      });
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new DOMException("storage blocked", "SecurityError");
      });
      const logoutTokens: string[] = [];
      const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
        if (input.includes("/v1/session/logout")) {
          logoutTokens.push(csrfHeader(init) ?? "");
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (input.includes("/v1/session")) return Promise.resolve(sessionOk(CSRF_B));
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let outcome!: LogoutResult;
      await act(async () => {
        outcome = await result.current.logout();
      });
      expect(outcome).toEqual({ success: true, reason: "revoked" });
      expect(logoutTokens).toEqual([CSRF_B]);
      expect(result.current.status).toBe("unauthenticated");
    });

    it("treats a real final-session 401 as already absent without POSTing logout", async () => {
      let sessionGets = 0;
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) {
          throw new Error("logout must not be called");
        }
        if (input.includes("/v1/session")) {
          sessionGets += 1;
          return Promise.resolve(sessionGets === 1 ? sessionOk() : sessionUnauthenticated());
        }
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let outcome!: LogoutResult;
      await act(async () => {
        outcome = await result.current.logout();
      });
      expect(outcome).toEqual({ success: true, reason: "already-absent" });
      expect(result.current.status).toBe("unauthenticated");
      expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes("/v1/session/logout"))).toBe(false);
    });

    it("treats a valid logout POST 401 as a concurrent already-absent session", async () => {
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return Promise.resolve(sessionUnauthenticated());
        if (input.includes("/v1/session")) return Promise.resolve(sessionOk());
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let outcome!: LogoutResult;
      await act(async () => {
        outcome = await result.current.logout();
      });
      expect(outcome).toEqual({ success: true, reason: "already-absent" });
      expect(result.current.status).toBe("unauthenticated");
    });

    it.each([
      ["network", () => Promise.reject(new Error("network down"))],
      ["valid 500", () => Promise.resolve(apiError("INTERNAL_ERROR", 500))],
      ["malformed", () => Promise.resolve(new Response("not json", { status: 502 }))],
    ])("does not claim sign-out when final GET has a %s failure", async (_label, finalResponse) => {
      let sessionGets = 0;
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) throw new Error("logout must not be called");
        if (input.includes("/v1/session")) {
          sessionGets += 1;
          return sessionGets === 1 ? Promise.resolve(sessionOk()) : finalResponse();
        }
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      window.sessionStorage.clear();
      let outcome!: LogoutResult;
      await act(async () => {
        outcome = await result.current.logout();
      });
      expect(outcome.success).toBe(false);
      expect(result.current.status).toBe("authenticated");
      expect(result.current.logoutError).toMatch(/not confirmed/i);
      expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes("/v1/session/logout"))).toBe(false);
    });

    it.each([
      ["network", () => Promise.reject(new Error("network down"))],
      ["valid 500", () => Promise.resolve(apiError("INTERNAL_ERROR", 500))],
      ["malformed 200", () => Promise.resolve(json({}, 200))],
    ])("keeps the final session retryable when logout has a %s failure", async (_label, logoutResponse) => {
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return logoutResponse();
        if (input.includes("/v1/session")) return Promise.resolve(sessionOk());
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let outcome!: LogoutResult;
      await act(async () => {
        outcome = await result.current.logout();
      });
      expect(outcome.success).toBe(false);
      expect(result.current.status).toBe("authenticated");
      expect(result.current.csrfToken).toBe(CSRF_A);
      expect(result.current.logoutError).toMatch(/not confirmed/i);
    });

    it("allows an explicit retry after an unconfirmed logout failure", async () => {
      let fail = true;
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) {
          return Promise.resolve(fail ? apiError("INTERNAL_ERROR", 500) : new Response(null, { status: 204 }));
        }
        if (input.includes("/v1/session")) return Promise.resolve(sessionOk());
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      await act(async () => {
        expect((await result.current.logout()).success).toBe(false);
      });
      expect(result.current.logoutError).toBeTruthy();

      fail = false;
      await act(async () => {
        expect(await result.current.logout()).toEqual({ success: true, reason: "revoked" });
      });
      expect(result.current.logoutError).toBeNull();
      expect(result.current.status).toBe("unauthenticated");
    });

    it("recovers once from INVALID_CSRF using the refreshed final-session token", async () => {
      let sessionGets = 0;
      const logoutTokens: string[] = [];
      const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
        if (input.includes("/v1/session/logout")) {
          const token = csrfHeader(init) ?? "";
          logoutTokens.push(token);
          return Promise.resolve(token === CSRF_A ? apiError("INVALID_CSRF", 403) : new Response(null, { status: 204 }));
        }
        if (input.includes("/v1/session")) {
          sessionGets += 1;
          return Promise.resolve(sessionOk(sessionGets < 3 ? CSRF_A : CSRF_B));
        }
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let outcome!: LogoutResult;
      await act(async () => {
        outcome = await result.current.logout();
      });
      expect(outcome).toEqual({ success: true, reason: "revoked" });
      expect(logoutTokens).toEqual([CSRF_A, CSRF_B]);
      expect(result.current.status).toBe("unauthenticated");
    });

    it("bounds INVALID_CSRF recovery to one retry and remains truthful on failure", async () => {
      let sessionGets = 0;
      const logoutTokens: string[] = [];
      const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
        if (input.includes("/v1/session/logout")) {
          logoutTokens.push(csrfHeader(init) ?? "");
          return Promise.resolve(apiError("INVALID_CSRF", 403));
        }
        if (input.includes("/v1/session")) {
          sessionGets += 1;
          return Promise.resolve(sessionOk(sessionGets < 3 ? CSRF_A : CSRF_B));
        }
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let outcome!: LogoutResult;
      await act(async () => {
        outcome = await result.current.logout();
      });
      expect(outcome).toEqual({ success: false, reason: "unconfirmed", code: "INVALID_CSRF" });
      expect(logoutTokens).toEqual([CSRF_A, CSRF_B]);
      expect(result.current.status).toBe("authenticated");
      expect(result.current.csrfToken).toBe(CSRF_B);
    });

    it("returns one shared deferred logout promise to repeated callers", async () => {
      const pendingLogout = deferred<Response>();
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return pendingLogout.promise;
        if (input.includes("/v1/session")) return Promise.resolve(sessionOk());
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let first!: Promise<LogoutResult>;
      let second!: Promise<LogoutResult>;
      act(() => {
        first = result.current.logout();
        second = result.current.logout();
      });
      expect(first).toBe(second);
      await waitFor(() => expect(result.current.loggingOut).toBe(true));
      expect(globalThis.fetch).toHaveBeenCalled();

      await act(async () => pendingLogout.resolve(new Response(null, { status: 204 })));
      await expect(first).resolves.toEqual({ success: true, reason: "revoked" });
      await expect(second).resolves.toEqual({ success: true, reason: "revoked" });
      const logoutCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/session/logout"));
      expect(logoutCalls).toHaveLength(1);
      expect(result.current.status).toBe("unauthenticated");
    });
  });

  describe("serialized terminal auth lifecycle", () => {
    it("waits for an already-active Telegram exchange, then revokes its final session B", async () => {
      const pendingAuthB = deferred<Response>();
      let sessionGets = 0;
      let authCalls = 0;
      let logoutToken = "";
      const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
        if (input.includes("/v1/session/logout")) {
          logoutToken = csrfHeader(init) ?? "";
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (input.includes("/v1/session")) {
          sessionGets += 1;
          if (sessionGets === 1) return Promise.resolve(sessionOk(CSRF_A));
          if (sessionGets === 2) return Promise.resolve(sessionUnauthenticated());
          return Promise.resolve(sessionOk(CSRF_B));
        }
        if (input.includes("/v1/auth/telegram")) {
          authCalls += 1;
          return pendingAuthB.promise;
        }
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      act(() => {
        void result.current.retry();
      });
      await waitFor(() => expect(authCalls).toBe(1));
      let logoutPromise!: Promise<LogoutResult>;
      act(() => {
        logoutPromise = result.current.logout();
      });
      await act(async () => pendingAuthB.resolve(telegramOk(CSRF_B)));
      await act(async () => {
        await logoutPromise;
      });
      expect(logoutToken).toBe(CSRF_B);
      expect(result.current.status).toBe("unauthenticated");
    });

    it("blocks retry requested in the same tick after logout intent", async () => {
      let authCalls = 0;
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return Promise.resolve(new Response(null, { status: 204 }));
        if (input.includes("/v1/session")) return Promise.resolve(sessionOk());
        if (input.includes("/v1/auth/telegram")) {
          authCalls += 1;
          return Promise.resolve(telegramOk());
        }
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let logoutPromise!: Promise<LogoutResult>;
      let retryPromise!: ReturnType<typeof result.current.retry>;
      act(() => {
        logoutPromise = result.current.logout();
        retryPromise = result.current.retry();
      });
      await act(async () => {
        await Promise.all([logoutPromise, retryPromise]);
      });
      expect(authCalls).toBe(0);
      expect(result.current.status).toBe("unauthenticated");
    });

    it("ignores invalidate requested after logout intent", async () => {
      const pendingLogout = deferred<Response>();
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return pendingLogout.promise;
        if (input.includes("/v1/session")) return Promise.resolve(sessionOk());
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      let logoutPromise!: Promise<LogoutResult>;
      act(() => {
        logoutPromise = result.current.logout();
        void result.current.invalidate();
      });
      await act(async () => pendingLogout.resolve(new Response(null, { status: 204 })));
      await act(async () => {
        await logoutPromise;
      });
      expect(result.current.status).toBe("unauthenticated");
    });

    it("prevents Telegram authentication from starting after logout interrupts a deferred initial GET", async () => {
      const pendingInitialSession = deferred<Response>();
      let sessionGets = 0;
      let authCalls = 0;
      let logoutCalls = 0;
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) {
          logoutCalls += 1;
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (input.includes("/v1/session")) {
          sessionGets += 1;
          return sessionGets === 1 ? pendingInitialSession.promise : Promise.resolve(sessionUnauthenticated());
        }
        if (input.includes("/v1/auth/telegram")) {
          authCalls += 1;
          return Promise.resolve(telegramOk(CSRF_B));
        }
        return Promise.resolve(json({}));
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(sessionGets).toBe(1));
      let logoutPromise!: Promise<LogoutResult>;
      act(() => {
        logoutPromise = result.current.logout();
      });
      await act(async () => pendingInitialSession.resolve(sessionUnauthenticated()));
      await expect(logoutPromise).resolves.toEqual({ success: true, reason: "already-absent" });
      expect(authCalls).toBe(0);
      expect(logoutCalls).toBe(0);
      expect(result.current.status).toBe("unauthenticated");
    });
  });
});
