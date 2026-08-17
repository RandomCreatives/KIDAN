// @vitest-environment jsdom
import { useState } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { useOnboardingDraft, type OnboardingDraftController } from "./useOnboardingDraft.js";
import { syntheticOnboardingState, type OnboardingFormState } from "./types.js";
import { ONBOARDING_SCHEMA_VERSION } from "@kidan/contracts";

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
        schemaVersion: ONBOARDING_SCHEMA_VERSION,
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

function draftWithVersion(version: number, payload: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      data: {
        schemaVersion: ONBOARDING_SCHEMA_VERSION,
        currentStep: "eligibility",
        payload,
        version,
        submitted: false,
        identityComplete: false,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("useOnboardingDraft", () => {
  let ctrlRef: { current: OnboardingDraftController | null } = { current: null };
  let stateRef: { current: OnboardingFormState | null } = { current: null };

  beforeEach(() => {
    ctrlRef = { current: null };
    stateRef = { current: null };
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
      const [draft, setDraft] = useState(syntheticOnboardingState);
      const ctrl = useOnboardingDraft(draft, setDraft);
      stateRef.current = draft;
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

    const first = await act(async () => ctrlRef.current!.saveProgress(2, syntheticOnboardingState));
    expect(first.success).toBe(true);
    expect(first.persisted).toBe(true);
    expect(ctrlRef.current!.conflict).toBe(false);

    const second = await act(async () => ctrlRef.current!.saveProgress(2, syntheticOnboardingState));
    expect(second.success).toBe(false);
    expect(second.persisted).toBe(false);
    await waitFor(() => expect(ctrlRef.current!.conflict).toBe(true));
  });

  it("derives persisted=true from an existing server draft without a PUT (T3-02 / T4-05)", async () => {
    const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (input.includes("/v1/onboarding/draft") && init?.method !== "PUT") {
        return Promise.resolve(
          draftWithVersion(2, { publicProfile: { city: "Saved City" }, faithAndFamily: { bio: "A saved introduction that is long enough." } }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: { version: 3, currentStep: "public_profile" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;

    mountHarness();
    await waitFor(() => expect(ctrlRef.current?.hydrated).toBe(true));
    expect(ctrlRef.current!.persisted).toBe(true);
    expect(ctrlRef.current!.resumedStep).not.toBeNull();
    await waitFor(() => expect(stateRef.current?.publicProfile.city).toBe("Saved City"));
    expect(stateRef.current?.faithAndFamily.bio).toBe("A saved introduction that is long enough.");
    const putCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).includes("/v1/onboarding/draft") && call[1]?.method === "PUT");
    expect(putCalls.length).toBe(0);
  });

  it("shares one awaitable conflict reload and settles every caller with the same result (T5-04)", async () => {
    let draftGets = 0;
    let resolveReload: (response: Response) => void = () => undefined;
    const pendingReload = new Promise<Response>((resolve) => {
      resolveReload = resolve;
    });
    const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (input.includes("/v1/onboarding/draft") && init?.method === "PUT") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "DRAFT_VERSION_CONFLICT", requestId: "r" } }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (input.includes("/v1/onboarding/draft")) {
        draftGets += 1;
        return draftGets === 1 ? Promise.resolve(draftEmpty()) : pendingReload;
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    mountHarness();
    await waitFor(() => expect(ctrlRef.current?.hydrated).toBe(true));
    await act(async () => ctrlRef.current!.saveProgress(2, syntheticOnboardingState));
    await waitFor(() => expect(ctrlRef.current?.conflict).toBe(true));

    let first!: ReturnType<OnboardingDraftController["reloadLatest"]>;
    let second!: ReturnType<OnboardingDraftController["reloadLatest"]>;
    act(() => {
      first = ctrlRef.current!.reloadLatest();
      second = ctrlRef.current!.reloadLatest();
    });
    expect(first).toBe(second);
    expect(ctrlRef.current!.reloading).toBe(true);
    expect(draftGets).toBe(2);

    await act(async () => resolveReload(draftWithVersion(2, { publicProfile: { city: "Server City" } })));
    await expect(first).resolves.toEqual({ success: true, persisted: true, step: 0 });
    await expect(second).resolves.toEqual({ success: true, persisted: true, step: 0 });
    await waitFor(() => expect(ctrlRef.current?.reloading).toBe(false));
    expect(ctrlRef.current!.conflict).toBe(false);
    expect(ctrlRef.current!.persisted).toBe(true);
  });

  it("preserves conflict state when an explicit reload fails", async () => {
    let draftGets = 0;
    const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
      if (input.includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (input.includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (input.includes("/v1/onboarding/draft") && init?.method === "PUT") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "DRAFT_VERSION_CONFLICT", requestId: "r" } }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (input.includes("/v1/onboarding/draft")) {
        draftGets += 1;
        return Promise.resolve(draftGets === 1 ? draftEmpty() : new Response("gateway failure", { status: 502 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    mountHarness();
    await waitFor(() => expect(ctrlRef.current?.hydrated).toBe(true));
    await act(async () => ctrlRef.current!.saveProgress(2, syntheticOnboardingState));
    await waitFor(() => expect(ctrlRef.current?.conflict).toBe(true));
    const result = await act(async () => ctrlRef.current!.reloadLatest());
    expect(result.success).toBe(false);
    expect(ctrlRef.current!.conflict).toBe(true);
    expect(ctrlRef.current!.reloadError).toBe(true);
    expect(ctrlRef.current!.persisted).toBe(false);
  });

  it("initializes persisted state as false for a fresh draft (T3-02)", async () => {
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

    await act(async () => {
      const saved = await ctrlRef.current!.saveProgress(2, syntheticOnboardingState);
      expect(saved.success).toBe(true);
      expect(saved.persisted).toBe(true);
    });
    await waitFor(() => expect(ctrlRef.current!.persisted).toBe(true));
  });
});
