import { describe, expect, it } from "vitest";
import type { DiscoveryProfile } from "@kidan/contracts";
import { toDemoProfile } from "./cardAdapter.js";

const base: DiscoveryProfile = {
  id: "KD-2A3B4C",
  publicCode: "KD-2A3B4C",
  age: 29,
  gender: "female",
  city: "Addis Ababa",
  occupationCategory: "Healthcare",
  educationLevel: "bachelors",
  heightCm: 165,
  faithTradition: "ethiopian_orthodox_tewahedo",
  marriageIntention: "teklil",
  values: ["active_faith", "honesty", "family_oriented"],
  bio: "A values-only bio used for the card adapter test.",
  verified: true,
  photoMode: "values_only",
};

describe("toDemoProfile", () => {
  it("preserves all values-only fields and never introduces identity", () => {
    const card = toDemoProfile(base);
    expect(card.publicCode).toBe("KD-2A3B4C");
    expect(card.age).toBe(29);
    expect(card.photoMode).toBe("values_only");
    expect(card.visual.monogram).toBe("29");
    // Abstract presentation, not a photo or name.
    expect(card.visual.accent).toMatch(/^#/);
    expect(card.faithNote).toContain("Teklil");
    const serialized = JSON.stringify(card);
    expect(serialized).not.toMatch(/name|phone|telegram|photoUrl/i);
  });

  it("is deterministic for the same public code", () => {
    expect(toDemoProfile(base).visual.accent).toBe(toDemoProfile(base).visual.accent);
  });
});
