import { describe, expect, it } from "vitest";
import { keyboardFor, parseAction, miniAppUrlFor, DEFAULT_INFO_BASE_URL } from "./botApp.js";
import type { MenuAction } from "./menu.js";

describe("botApp helpers", () => {
  it("round-trips a content action through callback data", () => {
    const action: MenuAction = { kind: "content", key: "rules" };
    const data = `kidan:${JSON.stringify(action)}`;
    expect(parseAction(data)).toEqual(action);
  });

  it("round-trips an open action", () => {
    const action: MenuAction = { kind: "open", target: "launch" };
    const data = `kidan:${JSON.stringify(action)}`;
    expect(parseAction(data)).toEqual(action);
  });

  it("returns null for unknown data", () => {
    expect(parseAction("not-ours")).toBeNull();
    expect(parseAction("kidan:garbage")).toBeNull();
  });

  it("maps launch to onboarding tab and adds from=bot", () => {
    const url = miniAppUrlFor("https://kidan-staging-app.vercel.app/", "launch");
    expect(url).toContain("tab=onboarding");
    expect(url).toContain("from=bot");
  });

  it("maps active/open to discover, status to status", () => {
    expect(miniAppUrlFor("https://x.app/", "home")).toContain("tab=discover");
    expect(miniAppUrlFor("https://x.app/", "status")).toContain("tab=status");
  });
});

type Btn = { text: string; url?: string; callback_data?: string; web_app?: { url: string } };
function buttonsOf(kb: ReturnType<typeof keyboardFor>): Btn[][] {
  // grammY seeds a fresh keyboard with one empty row; keyboardFor's first
  // kb.row() call leaves it in the raw matrix — filter empties for clarity.
  return (kb.inline_keyboard as unknown as Btn[][]).filter((row) => row.length > 0);
}

const HUB = "https://kidan-staging-info.vercel.app";

describe("keyboardFor info-hub swap-in-place", () => {
  it("replaces legacy short-note buttons and report with web_app buttons for the hub pages (new tier)", () => {
    const rows = buttonsOf(keyboardFor("new", "https://x.app/", HUB));
    // Row 0 "How it works" and row 1 "Rules / Privacy notice" keep positions, become webApp.
    expect(rows[0]).toEqual([{ text: "How it works", web_app: { url: `${HUB}/how-it-works.html` } }]);
    expect(rows[1]?.map((b) => b.web_app?.url)).toEqual([`${HUB}/rules.html`, `${HUB}/privacy.html`]);
    // FAQ + Report a concern also swap to webApp buttons.
    expect(rows[2]?.[0]).toEqual({ text: "FAQ", web_app: { url: `${HUB}/faq.html` } });
    expect(rows[2]?.[1]).toEqual({ text: "Report a concern", web_app: { url: `${HUB}/report.html` } });
    // Every info key is already covered above, so the only remaining row is the hero.
    expect(rows.length).toBe(4);
    expect(rows[3]?.[0].web_app?.url).toContain("tab=onboarding");
  });

  it("appends only the hub pages a tier lacks (active tier)", () => {
    const rows = buttonsOf(keyboardFor("active", "https://x.app/", HUB));
    // Status / Support row stays fully native.
    expect(rows[0]?.every((b) => typeof b.callback_data === "string")).toBe(true);
    // FAQ swaps in place; report also swaps to webApp.
    expect(rows[1]?.[0]).toEqual({ text: "FAQ", web_app: { url: `${HUB}/faq.html` } });
    expect(rows[1]?.[1]).toEqual({ text: "Report a concern", web_app: { url: `${HUB}/report.html` } });
    // Missing pages appended as webApp rows (how+rules, then privacy), then the hero.
    const webAppUrls = rows.flat().filter((b) => b.web_app).map((b) => b.web_app?.url);
    expect(webAppUrls).toEqual([
      `${HUB}/faq.html`,
      `${HUB}/report.html`,
      `${HUB}/how-it-works.html`,
      `${HUB}/rules.html`,
      `${HUB}/privacy.html`,
      "https://x.app/?tab=discover&from=bot",
    ]);
  });

  it("ensures no keyboard row contains a plain url button when info hub is linked", () => {
    const rows = buttonsOf(keyboardFor("new", "https://x.app/", HUB));
    expect(rows.flat().every((b) => b.url === undefined)).toBe(true);
  });

  it("uses default info hub URL when infoBaseUrl is undefined", () => {
    const rows = buttonsOf(keyboardFor("new", "https://x.app/"));
    expect(rows[0]?.[0]?.web_app?.url).toBe(`${DEFAULT_INFO_BASE_URL}/how-it-works.html`);
  });

  it("keeps the legacy short-note menu when infoBaseUrl is explicitly empty string", () => {
    const rows = buttonsOf(keyboardFor("new", "https://x.app/", ""));
    const nonHero = rows.slice(0, -1).flat();
    expect(nonHero.length).toBeGreaterThan(0);
    expect(nonHero.every((b) => typeof b.callback_data === "string" && !b.url && !b.web_app)).toBe(true);
  });
});
