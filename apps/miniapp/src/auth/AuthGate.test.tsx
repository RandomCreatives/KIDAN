// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider.js";
import { useAuth } from "./useAuth.js";
import { AuthGate } from "./AuthGate.js";

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

function bootFetch(input: string, mode: "auth" | "never"): Promise<Response> {
  if (input.includes("/v1/session")) {
    return mode === "never" ? new Promise<Response>(() => undefined) : Promise.resolve(sessionUnauthenticated());
  }
  if (input.includes("/v1/auth/telegram")) {
    return mode === "never" ? Promise.resolve(new Response("{}", { status: 200 })) : Promise.resolve(telegramOk());
  }
  return Promise.resolve(new Response("{}", { status: 200 }));
}

function Harness() {
  return (
    <AuthProvider>
      <AuthGate>
        <Inner />
      </AuthGate>
    </AuthProvider>
  );
}

function Inner() {
  const { invalidate } = useAuth();
  return (
    <>
      <button type="button" onClick={invalidate}>Expire</button>
      <div>Protected content</div>
    </>
  );
}

describe("AuthGate", () => {
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

  it("shows a connecting screen before authentication resolves", async () => {
    const fetchImpl = vi.fn((input: string) => bootFetch(input, "never"));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    render(<Harness />);

    const heading = screen.getByRole("heading", { name: /Connecting/i });
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByText(/Protected content/)).toBeNull();
  });

  it("renders children once authenticated", async () => {
    const fetchImpl = vi.fn((input: string) => bootFetch(input, "auth"));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    render(<Harness />);

    await waitFor(() => expect(screen.getByText(/Protected content/)).toBeTruthy());
  });

  it("shows the session-expired screen after invalidate (T3-03)", async () => {
    const fetchImpl = vi.fn((input: string) => bootFetch(input, "auth"));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    render(<Harness />);
    await waitFor(() => expect(screen.getByText(/Protected content/)).toBeTruthy());

    act(() => {
      screen.getByText(/Expire/i).click();
    });
    await waitFor(() => expect(screen.getByText(/Session expired/i)).toBeTruthy());
    expect(screen.queryByText(/Protected content/)).toBeNull();
  });

  it("keeps a NETWORK bootstrap failure recoverable with a focused Retry action", async () => {
    let sessionCalls = 0;
    const fetchImpl = vi.fn((input: string) => {
      if (input.includes("/v1/session")) {
        sessionCalls += 1;
        return sessionCalls === 1
          ? Promise.reject(new Error("network down"))
          : Promise.resolve(sessionUnauthenticated());
      }
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    render(<Harness />);

    await screen.findByRole("heading", { name: /Connection error/i });
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(document.activeElement).toBe(retry);
    expect(screen.queryByText(/Account unavailable/i)).toBeNull();

    fireEvent.click(retry);
    await screen.findByText(/Protected content/);
    expect(sessionCalls).toBe(2);
  });
});
