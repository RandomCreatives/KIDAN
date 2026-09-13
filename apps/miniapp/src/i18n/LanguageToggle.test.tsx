import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { AMHARIC_ENABLED, LanguageProvider, detectInitialLang } from "./LanguageProvider.js";
import { LanguageToggle } from "./LanguageToggle.js";

const AM_LABEL = "\u12a0\u121b\u122d\u129b"; // Amharic

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("Telegram", undefined);
  window.history.replaceState({}, "", "/");
});
afterEach(() => vi.restoreAllMocks());

describe("detectInitialLang (dark launch)", () => {
  it("is gated off: Amharic never auto-activates while AMHARIC_ENABLED is false", () => {
    expect(AMHARIC_ENABLED).toBe(false);
  });

  it("returns English even with a saved 'am' preference, and clears the stale choice", () => {
    window.localStorage.setItem("kidan.lang", "am");
    expect(detectInitialLang()).toBe("en");
    expect(window.localStorage.getItem("kidan.lang")).toBeNull();
  });

  it("ignores the ?lang=am URL override", () => {
    window.history.replaceState({}, "", "/?lang=am");
    expect(detectInitialLang()).toBe("en");
  });

  it("ignores a Telegram language_code of 'am'", () => {
    vi.stubGlobal("Telegram", { WebApp: { initDataUnsafe: { user: { language_code: "am" } } } });
    expect(detectInitialLang()).toBe("en");
  });
});

describe("LanguageToggle", () => {
  it("renders English as the active locale", () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
      </LanguageProvider>,
    );
    expect(screen.getByText("English").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(AM_LABEL).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a coming-soon notice instead of switching when Amharic is tapped", () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
        <span data-testid="probe">{document.documentElement.lang || "en"}</span>
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByText(AM_LABEL));
    expect(screen.getByRole("status").textContent).toContain("Amharic is coming soon");
    // locale did not switch
    expect(screen.getByText("English").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(AM_LABEL).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps English active when the English option is tapped", () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByText("English"));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("English").getAttribute("aria-pressed")).toBe("true");
  });
});
