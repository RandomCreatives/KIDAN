import { describe, expect, it } from "vitest";
import { readTargetTab, readTargetTabFromUrl } from "./deepLink.js";

describe("deep-link target parsing", () => {
  it("reads a supported tab from a URL", () => {
    expect(readTargetTabFromUrl("https://kidan.app/?tab=connections&from=bot")).toBe("connections");
    expect(readTargetTabFromUrl("https://kidan.app/?tab=onboarding")).toBe("onboarding");
  });

  it("returns null for unsupported/absent tabs", () => {
    expect(readTargetTabFromUrl("https://kidan.app/")).toBeNull();
    expect(readTargetTabFromUrl("https://kidan.app/?tab=reports")).toBeNull();
  });

  it("reads from a raw string", () => {
    expect(readTargetTab("PROFILE")).toBe("profile");
    expect(readTargetTab(null)).toBeNull();
  });
});
