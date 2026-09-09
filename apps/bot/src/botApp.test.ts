import { describe, expect, it } from "vitest";
import { parseAction, miniAppUrlFor } from "./botApp.js";
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
