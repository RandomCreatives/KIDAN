import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RealHomeGate } from "./RealHomeGate.js";

afterEach(() => vi.restoreAllMocks());

// Stub fetch to return the review-status and draft GETs.
function stubResponses(reviewStatus: unknown, draft: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/v1/onboarding/review-status")) {
        return new Response(JSON.stringify({ data: reviewStatus }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/v1/onboarding/draft")) {
        return new Response(JSON.stringify({ data: draft }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

describe("RealHomeGate", () => {
  it("calls onApproved when the candidate is approved", async () => {
    stubResponses(
      { status: "approved", feedbackNote: null, decidedAt: "2026-09-01T10:00:00.000Z" },
      { submitted: true },
    );
    const onApproved = vi.fn();
    render(<RealHomeGate onApproved={onApproved} onResumeOnboarding={() => undefined} />);
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
  });

  it("shows the private-review waiting screen for a submitted pending candidate", async () => {
    stubResponses(
      { status: "pending", feedbackNote: null, decidedAt: null },
      { submitted: true },
    );
    render(<RealHomeGate onApproved={() => undefined} onResumeOnboarding={() => undefined} />);
    expect(await screen.findByText(/in for private review/i)).toBeTruthy();
  });

  it("offers to reopen the profile when changes were requested", async () => {
    stubResponses(
      { status: "changes_requested", feedbackNote: "Please add a clearer city.", decidedAt: "2026-09-01T10:00:00.000Z" },
      { submitted: true },
    );
    const onResume = vi.fn();
    render(<RealHomeGate onApproved={() => undefined} onResumeOnboarding={onResume} />);
    const reopen = await screen.findByText("Reopen profile");
    fireEvent.click(reopen);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Please add a clearer city.")).toBeTruthy();
  });

  it("resumes onboarding for a candidate who has not actually submitted", async () => {
    const validDraft = {
      schemaVersion: "2026-08-12.v1",
      currentStep: "public_profile",
      payload: {},
      version: 3,
      submitted: false,
      identityComplete: false,
    };
    stubResponses({ status: "pending", feedbackNote: null, decidedAt: null }, validDraft);
    const onResume = vi.fn();
    render(<RealHomeGate onApproved={() => undefined} onResumeOnboarding={onResume} />);
    await waitFor(() => expect(onResume).toHaveBeenCalledTimes(1));
  });
});
