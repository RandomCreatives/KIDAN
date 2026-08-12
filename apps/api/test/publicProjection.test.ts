import { describe, expect, it } from "vitest";
import { publicOnboardingPayloadSchema } from "@kidan/contracts";
import { buildDiscoveryProjection } from "../src/onboarding/publicProjection.js";

const payload = publicOnboardingPayloadSchema.parse({
  eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
  publicProfile: {
    gender: "female",
    countryCode: "ET",
    city: "Addis Ababa",
    educationLevel: "bachelors",
    fieldOfStudy: "Public health",
    employmentStatus: "employed",
    occupationCategory: "Healthcare",
    maritalStatus: "never_married",
    hasChildren: false,
    heightCm: 165,
  },
  faithAndFamily: {
    faithTradition: "ethiopian_orthodox_tewahedo",
    marriageIntention: "kidusan_kurban",
    wantsChildren: "yes",
    values: ["active_faith", "family_oriented", "communication"],
    bio: "A synthetic profile with enough text for contract validation.",
  },
  partnerPreferences: {
    ageMin: 28,
    ageMax: 36,
    preferredCities: ["Addis Ababa"],
    openToAbroad: false,
    acceptedMaritalStatuses: ["never_married"],
    acceptsPartnerWithChildren: false,
    desiredValues: ["active_faith"],
    acceptedMarriageIntentions: ["kidusan_kurban"],
    additionalPreferences: "",
  },
});

describe("buildDiscoveryProjection", () => {
  it("constructs an allowlisted projection without identity or matching preferences", () => {
    const result = buildDiscoveryProjection({
      publicCode: "KD-7M4Q9X",
      age: 30,
      payload,
      verified: true,
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of ["fullName", "phone", "dateOfBirth", "telegram", "partnerPreferences", "preferredCities"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(result.id).toBe("KD-7M4Q9X");
    expect(serialized).not.toContain("68d44db3");
    expect(result.marriageIntention).toBe("kidusan_kurban");
  });
});
