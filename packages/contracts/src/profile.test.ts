import { describe, expect, it } from "vitest";
import { partnerPreferencesSchema, publicProfileCodeSchema } from "./profile.js";

describe("publicProfileCodeSchema", () => {
  it("accepts a neutral random code", () => {
    expect(publicProfileCodeSchema.parse("KD-7M4Q9X")).toBe("KD-7M4Q9X");
  });

  it("rejects old sequential channel codes", () => {
    expect(publicProfileCodeSchema.safeParse("M-311").success).toBe(false);
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
