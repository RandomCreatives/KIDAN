import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ReviewStatusCard } from "./ReviewStatusCard.js";

afterEach(() => vi.restoreAllMocks());

function stubStatus(status: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ data: status }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("ReviewStatusCard", () => {
  it("renders nothing when real submissions are disabled (demo mode makes no calls)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<ReviewStatusCard enabled={false} />);
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays hidden for a fresh candidate (pending, no decision yet)", async () => {
    stubStatus({ status: "pending", feedbackNote: null, decidedAt: null });
    const { container } = render(<ReviewStatusCard enabled={true} />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("shows the approved state", async () => {
    stubStatus({ status: "approved", feedbackNote: null, decidedAt: "2026-09-01T10:00:00.000Z" });
    render(<ReviewStatusCard enabled={true} />);
    expect(await screen.findByText("Approved")).toBeTruthy();
    expect(screen.queryByText(/note/i)).toBeNull();
  });

  it("shows changes-requested with the private note and a resubmit hint", async () => {
    stubStatus({
      status: "changes_requested",
      feedbackNote: "Please expand your bio.",
      decidedAt: "2026-09-01T10:00:00.000Z",
    });
    render(<ReviewStatusCard enabled={true} />);
    expect(await screen.findByText("Update requested")).toBeTruthy();
    expect(screen.getByText("Please expand your bio.")).toBeTruthy();
    expect(screen.getByText(/resubmit/i)).toBeTruthy();
  });

  it("shows rejected with the note but no identity", async () => {
    stubStatus({
      status: "rejected",
      feedbackNote: "Does not meet pilot eligibility.",
      decidedAt: "2026-09-01T10:00:00.000Z",
    });
    render(<ReviewStatusCard enabled={true} />);
    expect(await screen.findByText(/review result/i)).toBeTruthy();
    expect(screen.getByText("Does not meet pilot eligibility.")).toBeTruthy();
  });
});
