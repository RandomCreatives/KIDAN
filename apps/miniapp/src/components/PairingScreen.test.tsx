// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PairingScreen, PairingNextStepCard } from "./PairingScreen.js";

vi.mock("../auth/useAuth.js", () => ({
  useAuth: () => ({ realSubmissionsEnabled: true, csrfToken: "csrf" }),
}));

afterEach(() => vi.restoreAllMocks());

const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";

const baseView = {
  connectionId: CONNECTION_ID,
  stage: "chatting" as const,
  counterpartCode: "KD-223344",
  gate: { gateMet: true, daysRemaining: 0, messagesRemaining: 0 },
  readiness: {
    selfReady: false,
    otherReady: false,
    primerStage: "none" as const,
    notYetCycles: 0,
    zombieReflectionDue: false,
  },
  stalled: false,
  blocked: false,
};

function makeFetch(options: { revealOnConfirm?: number } = {}) {
  const { revealOnConfirm = 2 } = options;
  const calls: { method: string; path: string }[] = [];
  let readinessBothReady = false;
  let confirms = 0;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(status >= 400 ? { error: body } : { data: body }), {
      status,
      headers: { "content-type": "application/json" },
    });

  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path: url });
    if (url.includes("/readiness")) {
      readinessBothReady = true;
      return json({ state: "one_sided" });
    }
    if (url.includes("/confirm")) {
      confirms += 1;
      if (confirms >= revealOnConfirm) {
        return json({
          revealed: true,
          counterpart: { publicCode: "KD-223344", legalName: "Hanna Bekele", phone: "+251911223344" },
        });
      }
      return json({ revealed: false });
    }
    if (url.includes("/reveal")) {
      return json({ publicCode: "KD-223344", legalName: "Hanna Bekele", phone: "+251911223344" });
    }
    if (url.includes("/close")) {
      return json({ closed: true, followupDueAt: "2026-09-15T06:00:00.000Z" });
    }
    if (url.includes("/together")) {
      return json({ completedTogether: true });
    }
    if (url.endsWith(`/v1/pairings/${CONNECTION_ID}`)) {
      return json({
        ...baseView,
        readiness: readinessBothReady
          ? { ...baseView.readiness, selfReady: true, otherReady: true, primerStage: "awaiting_self" as const }
          : baseView.readiness,
      });
    }
    return json({});
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

describe("PairingScreen (Kidan Completion candidate surface)", () => {
  it("renders the readiness loop from the journey snapshot and answers 'ready'", async () => {
    makeFetch();
    render(<PairingScreen connectionId={CONNECTION_ID} onBack={() => undefined} />);

    expect(await screen.findByText(/Are you ready for the next step/i)).toBeTruthy();

    fireEvent.click(screen.getByText(/Yes, I'm ready/i));
    // One-sided state: the view refresh shows "Waiting on their heart".
    await waitFor(() => expect(screen.getByText(/One last step from you/i)).toBeTruthy());
  });

  it("runs the primer: first confirm waits, reload unveils the counterpart deliberately", async () => {
    makeFetch();
    render(<PairingScreen connectionId={CONNECTION_ID} onBack={() => undefined} />);
    await screen.findByText(/Are you ready for the next step/i);

    fireEvent.click(screen.getByText(/Yes, I'm ready/i));
    await screen.findByText(/One last step from you/i);

    fireEvent.click(screen.getByText(/Ready to meet/i)); // first confirm -> waiting
    expect(await screen.findByText(/Waiting for them to confirm/i)).toBeTruthy();
  });

  it("shows the reveal payload after the simultaneous confirm, plus the Together CTA", async () => {
    makeFetch({ revealOnConfirm: 1 });
    render(<PairingScreen connectionId={CONNECTION_ID} onBack={() => undefined} />);
    await screen.findByText(/Are you ready for the next step/i);
    fireEvent.click(screen.getByText(/Yes, I'm ready/i));
    await screen.findByText(/One last step from you/i);

    fireEvent.click(screen.getByText(/Ready to meet/i));
    expect(await screen.findByText("Hanna Bekele")).toBeTruthy();
    expect(screen.getByText(/KD-223344 · \+251911223344/)).toBeTruthy();

    fireEvent.click(screen.getByText(/We're together/i));
    expect(await screen.findByText(/Kidane Mihret/i)).toBeTruthy();
    expect(screen.getByText(/walking forward together/i)).toBeTruthy();
  });

  it("the respectful close surfaces the scheduled follow-up date", async () => {
    makeFetch();
    render(<PairingScreen connectionId={CONNECTION_ID} onBack={() => undefined} />);
    await screen.findByText(/Are you ready for the next step/i);

    fireEvent.click(screen.getByText(/Close respectfully/i));
    expect(await screen.findByText(/respectfully closed/i)).toBeTruthy();
    expect(screen.getByText(/15 September|September 15/i)).toBeTruthy();
  });

  it("renders an honest error when the pairing is not visible (privacy-safe 404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { code: "PAIRING_NOT_FOUND", requestId: "r1" } }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    render(<PairingScreen connectionId={CONNECTION_ID} onBack={() => undefined} />);
    expect(await screen.findByText(/not visible/i)).toBeTruthy();
  });
});

describe("PairingNextStepCard (chat header surface)", () => {
  it("summarises the locked gate with remaining requirements", () => {
    render(
      <PairingNextStepCard
        connectionId="x"
        journey={{ ...baseView, gate: { gateMet: false, daysRemaining: 5, messagesRemaining: 11 } }}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText(/Getting to know each other/i)).toBeTruthy();
    expect(screen.getByText(/5d and 11 messages/i)).toBeTruthy();
  });

  it("flags the one-sided readiness nudge with the counterpart code", () => {
    render(
      <PairingNextStepCard
        connectionId="x"
        journey={{ ...baseView, readiness: { ...baseView.readiness, otherReady: true } }}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText(/KD-223344 is ready when you are/i)).toBeTruthy();
  });

  it("hides itself for closed journeys (decoupled / together)", () => {
    const { container } = render(
      <PairingNextStepCard
        connectionId="x"
        journey={{ ...baseView, stage: "decoupled" as const }}
        onOpen={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
