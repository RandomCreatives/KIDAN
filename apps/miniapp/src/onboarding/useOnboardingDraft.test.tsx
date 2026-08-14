// @vitest-environment jsdom
import { useState } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { useOnboardingDraft, type OnboardingDraftController } from "./useOnboardingDraft.js";
import { syntheticOnboardingState } from "./types.js";

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

function draftEmpty(): Response {
  return new Response(
    JSON.stringify({
      data: {
        schemaVersion: "2026-08-12.v1",
        currentStep: "eligibility",
        payload: {},
        version: 0,
        submitted: false,
        identityComplete: false,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("useOnboardingDraft", () => {
  let ctrlRef: { current: OnboardingDraftController | null } = { current: null };

  beforeEach(() => {
    ctrlRef = { current: null };
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

  function mountHarness(): void {
    function Harness() {
      const [, setDraft] = useState(syntheticOnboardingState);
      const ctrl = useOnboardingDraft(syntheticOnboardingState, setDraft);
      ctrlRef.current = ctrl;
      return null;
    }
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
  }

  it("awaits a successful save and blocks navigation on conflict (R2-02 / R2-03)", async () => {
    let putCount = 0;
    const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (input.includes("/v1/onboarding/draft") && init?.method !== "PUT") return Promise.resolve(draftEmpty());
      putCount += 1;
      if (putCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { version: 1, currentStep: "public_profile" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: "DRAFT_VERSION_CONFLICT", requestId: "r" } }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    mountHarness();
    await waitFor(() => expect(ctrlRef.current?.hydrated).toBe(true));

    const first = await ctrlRef.current!.saveProgress(2, syntheticOnboardingState);
    expect(first.success).toBe(true);
    expect(first.persisted).toBe(true);
    expect(ctrlRef.current!.conflict).toBe(false);

    const second = await ctrlRef.current!.saveProgress(2, syntheticOnboardingState);
    expect(second.success).toBe(false);
    expect(second.persisted).toBe(false);
    await waitFor(() => expect(ctrlRef.current!.conflict).toBe(true));
  });

  it("initializes persisted state from an existing server draft (T3-02)", async () => {
    const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (input.includes("/v1/onboarding/draft") && init?.method !== "PUT") {
        return Promise.resolve(draftEmpty());
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: { version: 1, currentStep: "public_profile" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    mountHarness();
    await waitFor(() => expect(ctrlRef.current?.hydrated).toBe(true));
    expect(ctrlRef.current!.persisted).toBe(false);

    const saved = await ctrlRef.current!.saveProgress(2, syntheticOnboardingState);
    expect(saved.success).toBe(true);
    expect(saved.persisted).toBe(true);
    await waitFor(() => expect(ctrlRef.current!.persisted).toBe(true));
  });
});
