// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionsScreen } from "./ConnectionsScreen.js";

vi.mock("../auth/useAuth.js", () => ({
  useAuth: () => ({ realSubmissionsEnabled: true, csrfToken: "csrf" }),
}));

afterEach(() => vi.restoreAllMocks());

function stubConnections() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/connections")) {
        return new Response(
          JSON.stringify({
            data: {
              connections: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  status: "connected",
                  other: { publicCode: "KD-ABC234", age: 27, city: "Addis Ababa", gender: "female" },
                  iConfirmed: true,
                  theyConfirmed: true,
                  updatedAt: "2026-09-08T10:00:00.000Z",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/introduction")) {
        return new Response(
          JSON.stringify({
            data: {
              connectionId: "11111111-1111-4111-8111-111111111111",
              other: {
                id: "KD-ABC234",
                publicCode: "KD-ABC234",
                age: 27,
                gender: "female",
                city: "Addis Ababa",
                occupationCategory: "healthcare",
                educationLevel: "bachelors",
                heightCm: 165,
                faithTradition: "ethiopian_orthodox_tewahedo",
                marriageIntention: "teklil",
                values: ["faith"],
                bio: "A short values-centered bio for the thread view.",
                verified: true,
                photoMode: "values_only",
              },
              messages: [],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
}

describe("ConnectionsScreen", () => {
  it("opens the restricted introduction for a connected pair without a hook-order crash", async () => {
    stubConnections();
    render(<ConnectionsScreen />);

    // Connected card renders (values-only label; never a name).
    const card = await screen.findByText(/Introduction open/i);
    expect(card).toBeTruthy();

    // Tap the connected card (it is the openable row).
    const openable = document.querySelector(".connection-card.openable");
    expect(openable).toBeTruthy();
    fireEvent.click(openable as Element);

    // Introduction screen content appears (the previous hooks-order bug blanked the page).
    expect(await screen.findByText(/A private hello/i)).toBeTruthy();
    expect(screen.getByText(/No messages yet/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/KD-ABC234/)).toBeTruthy());
  });
});
