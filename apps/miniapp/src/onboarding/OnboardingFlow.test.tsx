// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { OnboardingFlow } from "./OnboardingFlow.js";

function clickContinue(): void {
  const button = document.querySelector(".continue-button") as HTMLButtonElement | null;
  if (button) fireEvent.click(button);
}

function setTelegram(initData: string): void {
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: { initData, ready: () => undefined, expand: () => undefined },
  };
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

function draftGet(currentStep: string, payload: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      data: {
        schemaVersion: "2026-08-12.v1",
        currentStep,
        payload,
        version: 2,
        submitted: false,
        identityComplete: false,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("OnboardingFlow", () => {
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

  it("demo mode makes zero API calls (R2-04 / R2-07)", () => {
    (window as unknown as { Telegram?: unknown }).Telegram = undefined;
    const fetchImpl = vi.fn();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="demo" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("real mode resumes at the server step (R2-03)", async () => {
    const fetchImpl = vi.fn((input: string) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (input.includes("/v1/onboarding/draft")) {
        return Promise.resolve(draftGet("faith_and_family", { publicProfile: { city: "Server City" } }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/3 of 5/)).toBeTruthy());
    expect(screen.getByText(/Describe the life you hope to build/)).toBeTruthy();
  });

  it("demo completes all steps end-to-end with zero network calls (T3-01)", async () => {
    (window as unknown as { Telegram?: unknown }).Telegram = undefined;
    const fetchImpl = vi.fn();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="demo" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /use synthetic sample/i }));
    for (let i = 0; i < 8; i += 1) {
      if (screen.queryByText(/Your profile would now enter private review/i)) break;
      clickContinue();
      await waitFor(() => true);
    }

    expect(screen.getByText(/Your profile would now enter private review/i)).toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("real final Save draft sends a checkpoint PUT and reaches success (T3-01)", async () => {
    let putCalls = 0;
    const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (input.includes("/v1/onboarding/draft") && init?.method !== "PUT") {
        return Promise.resolve(draftGet("public_preview", { publicProfile: { city: "Server City" } }));
      }
      if (input.includes("/v1/onboarding/draft") && init?.method === "PUT") {
        putCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ data: { version: 3, currentStep: "public_preview" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Know exactly what others can see/i)).toBeTruthy());
    clickContinue();
    await waitFor(() => expect(screen.getByText(/Your public draft is saved/i)).toBeTruthy());
    expect(putCalls).toBe(1);
  });
});
