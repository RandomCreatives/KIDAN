// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { OnboardingFlow } from "./OnboardingFlow.js";
import { syntheticOnboardingState } from "./types.js";

const syntheticPublicPayload: Record<string, unknown> = {
  eligibility: syntheticOnboardingState.eligibility,
  publicProfile: syntheticOnboardingState.publicProfile,
  faithAndFamily: {
    ...syntheticOnboardingState.faithAndFamily,
    faithTradition: "ethiopian_orthodox_tewahedo",
  },
  partnerPreferences: syntheticOnboardingState.partnerPreferences,
};

function clickContinue(): void {
  const button = document.querySelector(".continue-button") as HTMLButtonElement | null;
  if (!button) throw new Error("continue button not found");
  fireEvent.click(button);
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

function telegramOk(csrfToken = "x".repeat(43)): Response {
  return new Response(
    JSON.stringify({
      data: {
        authenticated: true,
        csrfToken,
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

function draftPutOk(): Response {
  return new Response(JSON.stringify({ data: { version: 3, currentStep: "faith_and_family" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function draftPutError(): Response {
  return new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", requestId: "r" } }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}

function deferredDraftFetch(initialStep: string, payload: Record<string, unknown>) {
  let resolvePut: (response: Response) => void = () => undefined;
  let putCount = 0;
  const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
    if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
    if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
    if (String(input).includes("/v1/onboarding/draft") && init?.method !== "PUT") {
      return Promise.resolve(draftGet(initialStep, payload));
    }
    if (String(input).includes("/v1/onboarding/draft") && init?.method === "PUT") {
      putCount += 1;
      if (putCount === 1) {
        return new Promise<Response>((resolve) => {
          resolvePut = resolve;
        });
      }
      return Promise.resolve(draftPutOk());
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  return { fetchImpl, resolveFirstPut: (response: Response) => resolvePut(response) };
}

describe("OnboardingFlow", () => {
  beforeEach(() => {
    setTelegram("valid-init-data");
    try {
      window.sessionStorage.clear();
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn() as unknown as typeof fetch;
    try {
      window.sessionStorage.clear();
    } catch {
      // ignore
    }
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

    // Step 1 — eligibility
    await screen.findByText(/1 of 7/);
    fireEvent.click(screen.getByRole("button", { name: /use synthetic sample/i }));
    clickContinue();

    // Steps 2–6: navigate through each step and assert the counter advances
    await screen.findByText(/2 of 7/);
    clickContinue();
    await screen.findByText(/3 of 7/);
    clickContinue();
    await screen.findByText(/4 of 7/);
    clickContinue();
    await screen.findByText(/5 of 7/);
    clickContinue();
    await screen.findByText(/6 of 7/);
    clickContinue();
    await screen.findByText(/7 of 7/);
    clickContinue();

    await screen.findByText(/Your profile would now enter private review/i);
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

  it("blocks header exit during an in-flight save (T4-03)", async () => {
    const { fetchImpl, resolveFirstPut } = deferredDraftFetch("public_preview", {
      publicProfile: { city: "Server City" },
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;
    const onExit = vi.fn();

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={onExit} onComplete={() => undefined} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Know exactly what others can see/i)).toBeTruthy());
    clickContinue();
    await act(async () => {
      await Promise.resolve();
    });
    const putStarted = fetchImpl.mock.calls.some(
      (call) => String(call[0]).includes("/v1/onboarding/draft") && call[1]?.method === "PUT",
    );
    expect(putStarted).toBe(true);
    fireEvent.click(screen.getByLabelText(/Exit onboarding/i));
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      resolveFirstPut(draftPutOk());
    });
    await waitFor(() => expect(screen.getByText(/Your public draft is saved/i)).toBeTruthy());
    expect(onExit).not.toHaveBeenCalled();
  });

  it("exits immediately when idle (T4-03)", async () => {
    const fetchImpl = vi.fn((input: string) => {
      if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (String(input).includes("/v1/onboarding/draft")) {
        return Promise.resolve(draftGet("public_preview", { publicProfile: { city: "Server City" } }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;
    const onExit = vi.fn();

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={onExit} onComplete={() => undefined} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Know exactly what others can see/i)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/Exit onboarding/i));
    await waitFor(() => expect(onExit).toHaveBeenCalled());
  });

  it("does not exit or complete when a pending save fails (T4-03)", async () => {
    const { fetchImpl, resolveFirstPut } = deferredDraftFetch("public_preview", {
      publicProfile: { city: "Server City" },
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;
    const onExit = vi.fn();

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={onExit} onComplete={() => undefined} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Know exactly what others can see/i)).toBeTruthy());
    await act(async () => clickContinue());
    await waitFor(() => {
      const putStarted = fetchImpl.mock.calls.some(
        (call) => String(call[0]).includes("/v1/onboarding/draft") && call[1]?.method === "PUT",
      );
      expect(putStarted).toBe(true);
    });
    fireEvent.click(screen.getByLabelText(/Exit onboarding/i));
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      resolveFirstPut(draftPutError());
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/Could not save your progress/i)).toBeTruthy();
    const continueBtn = document.querySelector(".continue-button") as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(false);
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByText(/Know exactly what others can see/i)).toBeTruthy();
  });

  it("blocks footer exit during an in-flight save (T4-03)", async () => {
    const { fetchImpl, resolveFirstPut } = deferredDraftFetch("eligibility", {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as unknown as typeof fetch;
    const onExit = vi.fn();

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={onExit} onComplete={() => undefined} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/1 of 5/)).toBeTruthy());
    clickContinue();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      resolveFirstPut(draftPutOk());
    });
    await waitFor(() => expect(screen.getByText(/2 of 5/)).toBeTruthy());
    expect(onExit).not.toHaveBeenCalled();
  });

  it("reapplies the original server step after local navigation and conflict (T4-04/T5-04)", async () => {
    let putCount = 0;
    const fetchImpl = vi.fn((input: string, init?: { method?: string }) => {
      if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (String(input).includes("/v1/onboarding/draft") && init?.method !== "PUT") {
        return Promise.resolve(draftGet("public_profile", syntheticPublicPayload));
      }
      if (String(input).includes("/v1/onboarding/draft") && init?.method === "PUT") {
        putCount += 1;
        if (putCount === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ data: { version: 3, currentStep: "public_profile" } }), {
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
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );

    await screen.findByText(/2 of 5/);
    clickContinue();
    await screen.findByText(/3 of 5/);
    clickContinue();
    const reloadButton = await screen.findByRole("button", { name: /Reload latest/i });
    fireEvent.click(reloadButton);
    await screen.findByText(/2 of 5/);
    expect(screen.queryByRole("button", { name: /Reload latest/i })).toBeNull();
  });

  it("awaits five ordered public-only writes through the complete real flow (T4-05/T5-05)", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const serverSteps = ["eligibility", "public_profile", "faith_and_family", "partner_preferences", "public_preview"];
    const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
      if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (String(input).includes("/v1/onboarding/draft") && init?.method !== "PUT") {
        return Promise.resolve(draftGet("eligibility", syntheticPublicPayload));
      }
      if (String(input).includes("/v1/onboarding/draft") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        requests.push(body);
        const index = requests.length - 1;
        return Promise.resolve(
          new Response(JSON.stringify({ data: { version: 3 + index, currentStep: serverSteps[index] } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );

    for (let visibleStep = 1; visibleStep <= 5; visibleStep += 1) {
      await screen.findByText(new RegExp(`${visibleStep} of 5`));
      clickContinue();
    }
    await screen.findByText(/Your public draft is saved/i);

    expect(requests).toHaveLength(5);
    expect(requests.map((request) => request.currentStep)).toEqual(serverSteps);
    expect(requests.map((request) => request.expectedVersion)).toEqual([2, 3, 4, 5, 6]);
    expect(Object.keys(requests[0]?.patch as object)).toEqual(["eligibility"]);
    expect(Object.keys(requests[1]?.patch as object)).toEqual(["publicProfile"]);
    expect(Object.keys(requests[2]?.patch as object)).toEqual(["faithAndFamily"]);
    expect(Object.keys(requests[3]?.patch as object)).toEqual(["partnerPreferences"]);
    expect(requests[4]?.patch).toEqual({});

    const serialized = JSON.stringify(requests);
    const forbiddenData = [
      "privateIdentity",
      "consent",
      "fullName",
      "dateOfBirth",
      "phoneNumber",
      "verificationPhoto",
      "telegram",
      "csrfToken",
      "sessionToken",
      syntheticOnboardingState.privateIdentity.fullName,
      syntheticOnboardingState.privateIdentity.phoneNumber,
    ];
    for (const forbidden of forbiddenData) expect(serialized).not.toContain(forbidden);

    expect(window.localStorage.length).toBe(0);
    const browserStorage = JSON.stringify({
      local: Object.entries(window.localStorage),
      sessionKeys: Object.keys(window.sessionStorage),
    });
    for (const forbidden of forbiddenData) expect(browserStorage).not.toContain(forbidden);
    expect(window.location.href).not.toMatch(/Demo%20Candidate|251%20900|csrf|sessionToken/i);
  });

  it("allows only the Back transition when Back and Continue occur in the same tick", async () => {
    let puts = 0;
    const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
      if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (String(input).includes("/v1/onboarding/draft") && init?.method === "PUT") {
        puts += 1;
        return Promise.resolve(draftPutOk());
      }
      if (String(input).includes("/v1/onboarding/draft")) {
        return Promise.resolve(draftGet("faith_and_family", syntheticPublicPayload));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );
    await screen.findByText(/3 of 5/);
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    clickContinue();
    await screen.findByText(/2 of 5/);
    expect(puts).toBe(0);
  });

  it("reports the first successful footer save with its authoritative persisted result (T5-03)", async () => {
    const onExit = vi.fn();
    const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
      if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (String(input).includes("/v1/onboarding/draft") && init?.method === "PUT") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { version: 1, currentStep: "eligibility" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(input).includes("/v1/onboarding/draft")) return Promise.resolve(draftEmpty());
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={onExit} onComplete={() => undefined} />
      </AuthProvider>,
    );
    await screen.findByText(/1 of 5/);
    fireEvent.click(screen.getByRole("button", { name: /I am 18 or older/i }));
    fireEvent.click(screen.getByRole("button", { name: /I am Ethiopian Orthodox Tewahedo/i }));
    fireEvent.click(screen.getByRole("button", { name: /I am seeking an intentional marriage/i }));
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));

    await waitFor(() => expect(onExit).toHaveBeenCalledWith(true));
  });

  it("holds the common action lock until a deferred conflict reload settles (T5-04)", async () => {
    let draftGets = 0;
    let resolveReload: (response: Response) => void = () => undefined;
    const pendingReload = new Promise<Response>((resolve) => {
      resolveReload = resolve;
    });
    const onExit = vi.fn();
    const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
      if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (String(input).includes("/v1/onboarding/draft") && init?.method === "PUT") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "DRAFT_VERSION_CONFLICT", requestId: "r" } }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(input).includes("/v1/onboarding/draft")) {
        draftGets += 1;
        return draftGets === 1
          ? Promise.resolve(draftGet("faith_and_family", syntheticPublicPayload))
          : pendingReload;
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={onExit} onComplete={() => undefined} />
      </AuthProvider>,
    );
    await screen.findByText(/3 of 5/);
    clickContinue();
    const reloadButton = await screen.findByRole("button", { name: /Reload latest/i });
    fireEvent.click(reloadButton);
    const headerExit = screen.getByRole("button", { name: /Exit onboarding/i });
    expect((headerExit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(headerExit);
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => resolveReload(draftGet("faith_and_family", syntheticPublicPayload)));
    await waitFor(() => expect((headerExit as HTMLButtonElement).disabled).toBe(false));
    expect(onExit).not.toHaveBeenCalled();
  });

  it("blocks progression when an intermediate write fails", async () => {
    let puts = 0;
    const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
      if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (String(input).includes("/v1/onboarding/draft") && init?.method === "PUT") {
        puts += 1;
        return Promise.resolve(draftPutError());
      }
      if (String(input).includes("/v1/onboarding/draft")) {
        return Promise.resolve(draftGet("eligibility", syntheticPublicPayload));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );
    await screen.findByText(/1 of 5/);
    clickContinue();
    await screen.findByText(/Could not save your progress/i);
    expect(screen.getByText(/1 of 5/)).toBeTruthy();
    expect(puts).toBe(1);
    expect(screen.queryByText(/Your public draft is saved/i)).toBeNull();
  });

  it("blocks loading-screen exit until the initial draft request settles", async () => {
    let resolveDraft: (response: Response) => void = () => undefined;
    const pendingDraft = new Promise<Response>((resolve) => {
      resolveDraft = resolve;
    });
    const onExit = vi.fn();
    const fetchImpl = vi.fn((input: string) => {
      if (String(input).includes("/v1/session")) return Promise.resolve(sessionUnauthenticated());
      if (String(input).includes("/v1/auth/telegram")) return Promise.resolve(telegramOk());
      if (String(input).includes("/v1/onboarding/draft")) return pendingDraft;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={onExit} onComplete={() => undefined} />
      </AuthProvider>,
    );
    await screen.findByText(/Loading your draft/i);
    const exit = screen.getByRole("button", { name: /Exit onboarding/i });
    expect((exit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(exit);
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => resolveDraft(draftGet("eligibility", syntheticPublicPayload)));
    await screen.findByText(/1 of 5/);
    expect(onExit).not.toHaveBeenCalled();
  });

  it("does not navigate backward when INVALID_CSRF recovery rehydrates an older server step", async () => {
    let sessionGets = 0;
    let authCalls = 0;
    let draftGets = 0;
    let putCalls = 0;
    const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
      if (String(input).includes("/v1/session")) {
        sessionGets += 1;
        return Promise.resolve(sessionUnauthenticated());
      }
      if (String(input).includes("/v1/auth/telegram")) {
        authCalls += 1;
        const token = authCalls === 1 ? "x".repeat(43) : "y".repeat(43);
        return Promise.resolve(telegramOk(token));
      }
      if (String(input).includes("/v1/onboarding/draft") && init?.method === "PUT") {
        putCalls += 1;
        if (putCalls === 1) return Promise.resolve(draftPutOk());
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "INVALID_CSRF", requestId: "retry" } }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(input).includes("/v1/onboarding/draft")) {
        draftGets += 1;
        // The server remains on public_profile while the user is editing the
        // next visible step. Recovery must not apply this older step again.
        return Promise.resolve(draftGet("public_profile", syntheticPublicPayload));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    render(
      <AuthProvider>
        <OnboardingFlow mode="real" onExit={() => undefined} onComplete={() => undefined} />
      </AuthProvider>,
    );

    await screen.findByText(/2 of 5/);
    clickContinue();
    await screen.findByText(/3 of 5/);

    clickContinue();
    await screen.findByText(/Your session changed. Reconnecting/i);
    await waitFor(() => expect(authCalls).toBe(2));
    await waitFor(() => expect(draftGets).toBe(2));

    expect(sessionGets).toBe(2);
    expect(putCalls).toBe(2);
    expect(screen.queryByText(/2 of 5/)).toBeNull();
    expect(screen.getByText(/3 of 5/)).toBeTruthy();
  });
});
