// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider.js";
import { AuthStatusBar } from "./AuthStatusBar.js";

const csrf = "x".repeat(43);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});
const session = () => json({ data: {
  authenticated: true,
  csrfToken: csrf,
  profileStatus: "active",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
} });

function setTelegram(): void {
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: "valid-init-data" } };
}

afterEach(() => {
  vi.restoreAllMocks();
  (window as unknown as { Telegram?: unknown }).Telegram = undefined;
  window.sessionStorage.clear();
});

it("announces and disables the sign-out action while revocation is pending", async () => {
  setTelegram();
  let resolveLogout: (response: Response) => void = () => undefined;
  const pendingLogout = new Promise<Response>((resolve) => {
    resolveLogout = resolve;
  });
  globalThis.fetch = vi.fn((input: string) => {
    if (input.includes("/v1/session/logout")) return pendingLogout;
    if (input.includes("/v1/session")) return Promise.resolve(session());
    return Promise.resolve(json({}));
  }) as unknown as typeof fetch;

  render(<AuthProvider><AuthStatusBar /></AuthProvider>);
  const signOut = await screen.findByRole("button", { name: "Sign out" });
  fireEvent.click(signOut);
  await waitFor(() => expect((signOut as HTMLButtonElement).disabled).toBe(true));
  expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  expect(screen.getAllByText(/Signing out/i).length).toBeGreaterThan(0);

  await act(async () => resolveLogout(new Response(null, { status: 204 })));
  await screen.findByText("Signed out");
});

it("announces an unconfirmed logout failure and keeps sign out available", async () => {
  setTelegram();
  let sessionGets = 0;
  let logoutPosts = 0;
  globalThis.fetch = vi.fn((input: string, init?: RequestInit) => {
    if (String(input).includes("/v1/session/logout") && init?.method === "POST") {
      logoutPosts += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (String(input).includes("/v1/session")) {
      sessionGets += 1;
      return sessionGets === 1 ? Promise.resolve(session()) : Promise.reject(new Error("offline"));
    }
    return Promise.resolve(json({}));
  }) as unknown as typeof fetch;

  render(<AuthProvider><AuthStatusBar /></AuthProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/not confirmed/i);
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.getByText("Signed in")).toBeTruthy();
  expect(logoutPosts).toBe(0);
});
