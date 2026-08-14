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

function defaultFetch(input: string): Promise<Response> {
  if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
  if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
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
    act(() => {
      result.current.invalidate();
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
});
