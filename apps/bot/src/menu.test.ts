import { describe, expect, it } from "vitest";
import { menuRows, startPayload, CONTENT, type MenuTier } from "./menu.js";

const appUrl = "https://kidan-staging-app.vercel.app/";

describe("bot menu", () => {
  it("new users get onboarding content + a Launch hero", () => {
    const rows = menuRows("new", appUrl);
    const texts = rows.flatMap((r) => r.buttons.map((b) => b.text));
    expect(texts).toContain("How it works");
    expect(texts).toContain("Rules");
    expect(texts).toContain("Privacy notice");
    expect(texts).toContain("FAQ");
    expect(texts).toContain("Report a concern");
    expect(texts).toContain("▶  Launch");
    // Active-only entries are absent for a brand-new user.
    expect(texts).not.toContain("Status");
    expect(texts).not.toContain("Support");
  });

  it("active users get Status + Support + Open Kidan", () => {
    const rows = menuRows("active", appUrl);
    const texts = rows.flatMap((r) => r.buttons.map((b) => b.text));
    expect(texts).toContain("Status");
    expect(texts).toContain("Support");
    expect(texts).toContain("Open Kidan");
    // Onboarding entries are absent for an active user.
    expect(texts).not.toContain("How it works");
    expect(texts).not.toContain("▶  Launch");
    // FAQ + Report always present.
    expect(texts).toContain("FAQ");
    expect(texts).toContain("Report a concern");
  });

  it("hero button always spans a full row", () => {
    for (const tier of ["new", "active"] as MenuTier[]) {
      const hero = menuRows(tier, appUrl).find((r) => r.hero);
      expect(hero).toBeDefined();
      expect(hero!.buttons).toHaveLength(1);
    }
  });

  it("never puts identity or contact details in any button text", () => {
    for (const tier of ["new", "active", "all"] as MenuTier[]) {
      for (const row of menuRows(tier, appUrl)) {
        for (const button of row.buttons) {
          expect(button.text).not.toMatch(/name|phone|telegram|@|http|photo/i);
        }
      }
    }
  });

  it("every content key has copy", () => {
    for (const key of ["how", "rules", "privacy", "faq", "status"] as const) {
      expect(CONTENT[key].title.length).toBeGreaterThan(0);
      expect(CONTENT[key].body.length).toBeGreaterThan(0);
    }
  });

  it("startPayload returns text + rows", () => {
    const payload = startPayload("new", appUrl);
    expect(payload.text).toContain("Welcome to Kidan");
    expect(payload.rows.length).toBeGreaterThan(0);
  });
});
