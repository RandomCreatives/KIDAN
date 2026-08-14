// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider.js";
import { useAuth } from "./useAuth.js";

function setTelegram(initData: string): void {
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData } };
}

function sessionUnauthenticated(): Response {
  return new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", requestId: "r" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

function telegramOk(): Response {
  return new Response(
    JSON.stringify({
      data: {
        authenticated: true,
        csrfToken: "x".repeat(43),
        profileStatus: "new",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function sessionOk(): Response {
  return new Response(
    JSON.stringify({
      data: {
        authenticated: true,
        csrfToken: "x".repeat(43),
        profileStatus: "active",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function apiError(code: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: { code, requestId: "req_test1234567890" } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function defaultFetch(input: string): Promise<Response> {
  if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
  if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
  return Promise.resolve(new Response("{}", { status: 200 }));
}

function authedFetch(input: string): Promise<Response> {
  if (input.includes("/v1/session/logout")) return Promise.resolve(new Response(null, { status: 204 }));
  if (input.includes("/v1/session")) return Promise.resolve(sessionOk());
  return Promise.resolve(new Response("{}", { status: 200 }));
}

describe("AuthProvider", () => {
  beforeEach(() => {
    setTelegram("valid-init-data");
    try {
      window.sessionStorage.clear();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (window as unknown as { Telegram?: unknown }).Telegram = undefined;
  });

  it("authenticates through bound client methods (R2-01)", async () => {
    const fetchImpl = vi.fn((input: string) => defaultFetch(input));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.csrfToken).toBe("x".repeat(43));
  });

  it("shares one in-flight bootstrap across concurrent calls (R2-05)", async () => {
    let resolveSession: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveSession = resolve;
    });
    const fetchImpl = vi.fn((input: string) => {
      if (input.includes("/v1/session")) return pending;
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => {
      result.current.retry();
      result.current.retry();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).not.toBe("authenticated");
    const sessionCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/session"));
    expect(sessionCalls.length).toBe(1);

    await act(async () => {
      resolveSession(sessionUnauthenticated());
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
  });

  it("invalidates and clears local session state", async () => {
    const fetchImpl = vi.fn((input: string) => defaultFetch(input));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    await act(async () => {
      result.current.invalidate();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("expired");
    expect(result.current.csrfToken).toBeNull();
  });

  it("logs out and clears the local session after server revocation (T3-03)", async () => {
    const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
      if (input.includes("/v1/session/logout")) return Promise.resolve(new Response(null, { status: 204 }));
      return defaultFetch(input);
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.csrfToken).toBeNull();
  });

  it("ignores a bootstrap that resolves after logout (T3-03)", async () => {
    let resolveSession: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveSession = resolve;
    });
    const fetchImpl = vi.fn((input: string) => {
      if (input.includes("/v1/session")) return pending;
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (input.includes("/v1/session/logout")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => {
      result.current.retry();
    });
    let logoutPromise: Promise<void> = Promise.resolve();
    act(() => {
      logoutPromise = result.current.logout();
    });
    await act(async () => {
      resolveSession(sessionUnauthenticated());
    });
    await act(async () => {
      await logoutPromise;
    });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
  });

  describe("T4-01 truthful logout", () => {
    it("signs out only after the server confirms revocation (204)", async () => {
      const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
        if (input.includes("/v1/session/logout")) return Promise.resolve(new Response(null, { status: 204 }));
        return authedFetch(input);
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.status).toBe("unauthenticated");
      expect(result.current.csrfToken).toBeNull();
      expect(result.current.logoutError).toBeNull();
    });

    it("treats an already-absent session as signed out", async () => {
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return Promise.resolve(new Response(null, { status: 204 }));
        return authedFetch(input);
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      await act(async () => {
        window.sessionStorage.clear();
      });
      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.status).toBe("unauthenticated");
    });

    it("keeps the user signed in when the server cannot confirm revocation (network failure)", async () => {
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return Promise.reject(new Error("network down"));
        return authedFetch(input);
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.status).toBe("authenticated");
      expect(result.current.logoutError).not.toBeNull();
      expect(result.current.csrfToken).not.toBeNull();
    });

    it("recovers and signs out after a transient logout failure", async () => {
      let failLogout = true;
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) {
          if (failLogout) return Promise.resolve(new Response(null, { status: 500 }));
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return authedFetch(input);
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.status).toBe("authenticated");
      expect(result.current.logoutError).not.toBeNull();

      await act(async () => {
        failLogout = false;
        await result.current.logout();
      });
      expect(result.current.status).toBe("unauthenticated");
      expect(result.current.logoutError).toBeNull();
    });

    it("keeps the user signed in on a malformed logout response (non-204)", async () => {
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return Promise.resolve(new Response("{}", { status: 200 }));
        return authedFetch(input);
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.status).toBe("authenticated");
      expect(result.current.logoutError).not.toBeNull();
    });

    it("keeps the user signed in on INVALID_CSRF logout and allows retry", async () => {
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return Promise.resolve(apiError("INVALID_CSRF", 403));
        return authedFetch(input);
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.status).toBe("authenticated");
      expect(result.current.logoutError).not.toBeNull();
    });

    it("issues a single logout request for repeated clicks (single-flight)", async () => {
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session/logout")) return Promise.resolve(new Response(null, { status: 204 }));
        return authedFetch(input);
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      await act(async () => {
        void result.current.logout();
        void result.current.logout();
        await result.current.logout();
      });
      const logoutCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/session/logout"));
      expect(logoutCalls.length).toBe(1);
      await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    });
  });

  describe("T4-02 serialized auth lifecycle", () => {
    it("awaits an in-flight bootstrap before revoking, with one telegram exchange", async () => {
      let resolveSession: (response: Response) => void = () => undefined;
      const pending = new Promise<Response>((resolve) => {
        resolveSession = resolve;
      });
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session") && !input.includes("/v1/session/logout")) return pending;
        if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
        if (input.includes("/v1/session/logout")) return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.resolve(new Response("{}", { status: 200 }));
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      let logoutPromise: Promise<void> = Promise.resolve();
      act(() => {
        logoutPromise = result.current.logout();
      });
      await act(async () => {
        resolveSession(sessionUnauthenticated());
      });
      await act(async () => {
        await logoutPromise;
      });
      await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
      const telegramCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/auth/telegram"));
      expect(telegramCalls.length).toBe(1);
    });

    it("does not start a second telegram exchange when retry races an in-flight bootstrap", async () => {
      let resolveSession: (response: Response) => void = () => undefined;
      const pending = new Promise<Response>((resolve) => {
        resolveSession = resolve;
      });
      const fetchImpl = vi.fn((input: string) => {
        if (input.includes("/v1/session") && !input.includes("/v1/session/logout")) return pending;
        if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
        return Promise.resolve(new Response("{}", { status: 200 }));
      });
      (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      act(() => {
        result.current.retry();
        result.current.retry();
      });
      const telegramCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/auth/telegram"));
      expect(telegramCalls.length).toBe(0);
      await act(async () => {
        resolveSession(sessionUnauthenticated());
      });
      await waitFor(() => expect(result.current.status).toBe("authenticated"));
      const telegramCallsAfter = fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/auth/telegram"));
      expect(telegramCallsAfter.length).toBe(1);
    });
  });
});
