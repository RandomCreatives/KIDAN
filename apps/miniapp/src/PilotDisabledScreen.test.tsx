// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PilotDisabledScreen } from "./PilotDisabledScreen.js";

describe("PilotDisabledScreen", () => {
  it("distinguishes data sent to Kidan, retained for auth, and shown in discovery (T4-06/T5-06)", () => {
    const { container } = render(<PilotDisabledScreen onReopen={() => undefined} saved={false} />);
    const copy = container.textContent ?? "";

    expect(copy).toMatch(/Telegram launch data is sent securely to Kidan to authenticate/i);
    expect(copy).toMatch(/retains the validated Telegram ID and authentication date/i);
    expect(copy).toMatch(/names and usernames are not added to your public draft or shown in discovery/i);
    expect(copy).toMatch(/does not collect Kidan private identity, verification-photo, or submission-consent details/i);
    expect(copy).not.toMatch(/no identity or contact details are shared/i);
    expect(copy).not.toMatch(/no verification identity, phone number, or contact details are shared/i);
    expect(screen.getByText(/In this preview you can sign in and save your public profile sections/i)).toBeTruthy();
  });
});
