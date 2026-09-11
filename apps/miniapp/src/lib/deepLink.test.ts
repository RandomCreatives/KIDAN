import { describe, expect, it } from "vitest";
import { readPairingFocusFromUrl, readTargetTab, readTargetTabFromUrl } from "./deepLink.js";

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

  it("reads the pairing tab", () => {
    expect(readTargetTabFromUrl("https://kidan.app/?tab=pairing&from=bot")).toBe("pairing");
  });
});

describe("pairing journey focus deep link", () => {
  const id = "33333333-3333-4333-8333-333333333333";

  it("reads a valid pairing focus", () => {
    expect(readPairingFocusFromUrl(`https://kidan.app/?tab=pairing&connection=${id}&from=bot`)).toBe(id);
  });

  it("rejects malformed connection values and non-pairing tabs", () => {
    expect(readPairingFocusFromUrl("https://kidan.app/?tab=pairing&connection=not-a-uuid")).toBeNull();
    expect(readPairingFocusFromUrl("https://kidan.app/?tab=pairing")).toBeNull();
    expect(readPairingFocusFromUrl(`https://kidan.app/?tab=connections&connection=${id}`)).toBeNull();
  });
});
