import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  discoveryProfileSchema,
  faithAndFamilyDraftSchema,
  marriageIntentionSchema,
  partnerPreferencesDraftSchema,
  partnerPreferencesSchema,
} from "./index.js";

type DiscoveryIntention = z.input<typeof discoveryProfileSchema>["marriageIntention"];
type OnboardingIntention = z.input<typeof faithAndFamilyDraftSchema>["marriageIntention"];
type DiscoveryPreferenceIntention = z.input<typeof partnerPreferencesSchema>["acceptedMarriageIntentions"][number];
type OnboardingPreferenceIntention = z.input<typeof partnerPreferencesDraftSchema>["acceptedMarriageIntentions"][number];

type IsEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;

const discoveryAndOnboardingAreCompatible: Assert<IsEqual<DiscoveryIntention, OnboardingIntention>> = true;
const preferencesAreCompatible: Assert<IsEqual<DiscoveryPreferenceIntention, OnboardingPreferenceIntention>> = true;

describe("cross-workspace marriage-intention compatibility", () => {
  it("keeps discovery and onboarding input types identical", () => {
    expect(discoveryAndOnboardingAreCompatible).toBe(true);
    expect(preferencesAreCompatible).toBe(true);
  });

  it.each(marriageIntentionSchema.options)("accepts %s at every profile boundary", (intention) => {
    expect(discoveryProfileSchema.shape.marriageIntention.safeParse(intention).success).toBe(true);
    expect(faithAndFamilyDraftSchema.shape.marriageIntention.safeParse(intention).success).toBe(true);
    expect(partnerPreferencesSchema.shape.acceptedMarriageIntentions.safeParse([intention]).success).toBe(true);
    expect(partnerPreferencesDraftSchema.safeParse({
      ageMin: 25,
      ageMax: 35,
      preferredCities: ["Addis Ababa"],
      openToAbroad: false,
      acceptedMaritalStatuses: ["never_married"],
      acceptsPartnerWithChildren: false,
      desiredValues: ["active_faith"],
      acceptedMarriageIntentions: [intention],
      additionalPreferences: "",
    }).success).toBe(true);
  });
});
