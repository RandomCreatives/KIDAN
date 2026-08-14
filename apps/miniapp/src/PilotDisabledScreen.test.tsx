// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PilotDisabledScreen } from "./PilotDisabledScreen.js";

describe("PilotDisabledScreen", () => {
  it("uses accurate, scoped privacy language (T4-06)", () => {
    render(<PilotDisabledScreen onReopen={() => undefined} saved={false} />);

    const body = screen.getByText(/Only your public profile sections are transmitted/i).textContent ?? "";
    expect(body).not.toMatch(/no identity or contact details are shared/i);
    expect(body).toMatch(/launch\s+credential required for authentication/i);
    expect(body).toMatch(/no verification identity, phone number, or contact details are\s*shared/i);
  });
});
