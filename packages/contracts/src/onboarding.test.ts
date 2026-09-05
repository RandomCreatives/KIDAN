import { describe, expect, it } from "vitest";
import {
  INITIAL_ONBOARDING_STEP,
  ONBOARDING_SCHEMA_VERSION,
  onboardingDraftSchema,
  onboardingFieldVisibility,
  onboardingStepSchema,
  partialPublicOnboardingPayloadSchema,
  partnerPreferencesDraftSchema,
} from "./onboarding.js";

const validDraft = {
  schemaVersion: ONBOARDING_SCHEMA_VERSION,
  eligibility: {
    adultConfirmed: true,
    eotcConfirmed: true,
    marriageIntentConfirmed: true,
  },
  privateIdentity: {
    fullName: "Demo Candidate",
    dateOfBirth: "1996-04-12",
    phoneNumber: "+251900000000",
    verificationPhotoStatus: "not_available_in_prototype",
  },
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
    marriageIntention: "teklil",
    wantsChildren: "yes",
    values: ["active_faith", "family_oriented", "communication"],
    bio: "A synthetic profile used only for validating the onboarding contract.",
  },
  partnerPreferences: {
    ageMin: 27,
    ageMax: 35,
    preferredCities: ["Addis Ababa"],
    openToAbroad: false,
    acceptedMaritalStatuses: ["never_married"],
    acceptsPartnerWithChildren: false,
    desiredValues: ["active_faith", "honesty"],
    acceptedMarriageIntentions: ["teklil"],
    additionalPreferences: "",
  },
  consent: {
    informationAccurate: true,
    identityProcessing: true,
    faithDataProcessing: true,
    discoveryPublication: true,
    verificationPhotoRetention: true,
    communityRules: true,
    botNotifications: false,
  },
} as const;

describe("shared onboarding defaults", () => {
  it("keeps the exported version and initial step accepted by their schemas", () => {
    expect(onboardingDraftSchema.shape.schemaVersion.parse(ONBOARDING_SCHEMA_VERSION)).toBe(ONBOARDING_SCHEMA_VERSION);
    expect(onboardingStepSchema.parse(INITIAL_ONBOARDING_STEP)).toBe(INITIAL_ONBOARDING_STEP);
  });
});

describe("onboardingDraftSchema", () => {
  it("accepts a normalized complete draft", () => {
    expect(onboardingDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("rejects profile values that do not meet the minimum", () => {
    const result = onboardingDraftSchema.safeParse({
      ...validDraft,
      faithAndFamily: { ...validDraft.faithAndFamily, values: ["honesty"] },
    });
    expect(result.success).toBe(false);
  });
});

describe("partnerPreferencesDraftSchema", () => {
  it("rejects inverted age ranges", () => {
    const result = partnerPreferencesDraftSchema.safeParse({
      ...validDraft.partnerPreferences,
      ageMin: 40,
      ageMax: 30,
    });
    expect(result.success).toBe(false);
  });

  it("rejects inverted age bounds when both are present in a partial patch", () => {
    const result = partialPublicOnboardingPayloadSchema.safeParse({
      partnerPreferences: { ageMin: 40, ageMax: 30 },
    });
    expect(result.success).toBe(false);
    expect(partialPublicOnboardingPayloadSchema.safeParse({
      partnerPreferences: { ageMin: 30 },
    }).success).toBe(true);
  });
});

describe("field visibility", () => {
  it("keeps identity private, preferences matching-only, and contact behind later consent", () => {
    expect(onboardingFieldVisibility["privateIdentity.fullName"]).toBe("admin_only");
    expect(onboardingFieldVisibility["partnerPreferences.ageMin"]).toBe("matching_only");
    expect(onboardingFieldVisibility.contactDetails).toBe("after_mutual_consent");
  });
});
