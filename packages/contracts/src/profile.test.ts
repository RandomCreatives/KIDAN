import { describe, expect, it } from "vitest";
import { discoveryProfileSchema, partnerPreferencesSchema, publicProfileCodeSchema } from "./profile.js";

describe("publicProfileCodeSchema", () => {
  it("accepts a neutral random code", () => {
    expect(publicProfileCodeSchema.parse("KD-7M4Q9X")).toBe("KD-7M4Q9X");
  });

  it("rejects old sequential channel codes", () => {
    expect(publicProfileCodeSchema.safeParse("M-311").success).toBe(false);
  });
});

describe("marriageIntentionSchema", () => {
  it("uses the canonical Kidusan Kurban storage value", () => {
    const baseProfile = {
      id: "68d44db3-5e31-44c6-8282-4d06ca1f3f68",
      publicCode: "KD-7M4Q9X",
      age: 27,
      gender: "female",
      city: "Addis Ababa",
      occupationCategory: "Healthcare",
      educationLevel: "Bachelor’s degree",
      heightCm: 163,
      faithTradition: "ethiopian_orthodox_tewahedo",
      values: ["active_faith"],
      bio: "Synthetic profile text.",
      verified: true,
      photoMode: "values_only",
    } as const;

    expect(
      discoveryProfileSchema.safeParse({ ...baseProfile, marriageIntention: "kidusan_kurban" }).success,
    ).toBe(true);
    expect(discoveryProfileSchema.safeParse({ ...baseProfile, marriageIntention: "kurban" }).success).toBe(false);
  });
});

describe("partnerPreferencesSchema", () => {
  it("rejects an inverted age range", () => {
    const result = partnerPreferencesSchema.safeParse({
      ageMin: 35,
      ageMax: 25,
      cityCodes: [],
      openToAbroad: false,
      desiredValues: [],
      acceptedMarriageIntentions: ["teklil"],
    });

    expect(result.success).toBe(false);
  });
});
