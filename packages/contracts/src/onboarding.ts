import { z } from "zod";
import { genderSchema, marriageIntentionSchema, valueTagSchema } from "./profile.js";

export const ONBOARDING_SCHEMA_VERSION = "2026-08-12.v1" as const;
export const INITIAL_ONBOARDING_STEP = "eligibility" as const;

export const fieldVisibilitySchema = z.enum([
  "admin_only",
  "discovery",
  "matching_only",
  "after_mutual_consent",
]);

export const onboardingStepSchema = z.enum([
  INITIAL_ONBOARDING_STEP,
  "private_identity",
  "public_profile",
  "faith_and_family",
  "partner_preferences",
  "public_preview",
  "consent",
  "submitted",
]);

export const eligibilitySchema = z.object({
  adultConfirmed: z.literal(true),
  eotcConfirmed: z.literal(true),
  marriageIntentConfirmed: z.literal(true),
});

export const privateIdentityDraftSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: z.iso.date(),
  phoneNumber: z.string().trim().min(8).max(24),
  verificationPhotoStatus: z.enum(["not_available_in_prototype", "pending_upload"]),
});

export const educationLevelSchema = z.enum([
  "secondary",
  "certificate",
  "diploma",
  "bachelors",
  "masters",
  "doctorate",
  "other",
]);

export const employmentStatusSchema = z.enum([
  "employed",
  "self_employed",
  "student",
  "seeking_work",
  "not_working",
  "other",
]);

export const maritalStatusSchema = z.enum([
  "never_married",
  "widowed",
  "civilly_divorced",
  "other_requires_review",
]);

export const publicProfileDraftSchema = z.object({
  gender: genderSchema,
  countryCode: z.string().length(2),
  city: z.string().trim().min(2).max(80),
  educationLevel: educationLevelSchema,
  fieldOfStudy: z.string().trim().max(80),
  employmentStatus: employmentStatusSchema,
  occupationCategory: z.string().trim().min(2).max(80),
  maritalStatus: maritalStatusSchema,
  hasChildren: z.boolean(),
  heightCm: z.number().int().min(120).max(230).nullable(),
});

export const faithAndFamilyDraftSchema = z.object({
  faithTradition: z.literal("ethiopian_orthodox_tewahedo"),
  marriageIntention: marriageIntentionSchema,
  wantsChildren: z.enum(["yes", "no", "open_to_discussion"]),
  values: z.array(valueTagSchema).min(3).max(6),
  bio: z.string().trim().min(20).max(280),
});

const partnerPreferencesObjectSchema = z.object({
  ageMin: z.number().int().min(18).max(90),
  ageMax: z.number().int().min(18).max(90),
  preferredCities: z.array(z.string().trim().min(2).max(80)).max(12),
  openToAbroad: z.boolean(),
  acceptedMaritalStatuses: z.array(maritalStatusSchema).min(1),
  acceptsPartnerWithChildren: z.boolean(),
  desiredValues: z.array(valueTagSchema).min(1).max(6),
  acceptedMarriageIntentions: z.array(marriageIntentionSchema).min(1),
  additionalPreferences: z.string().trim().max(400),
});

export const partnerPreferencesDraftSchema = partnerPreferencesObjectSchema.refine(
  (value) => value.ageMin <= value.ageMax,
  {
    message: "Minimum age must not exceed maximum age",
    path: ["ageMin"],
  },
);

export const consentDraftSchema = z.object({
  informationAccurate: z.literal(true),
  identityProcessing: z.literal(true),
  faithDataProcessing: z.literal(true),
  discoveryPublication: z.literal(true),
  verificationPhotoRetention: z.literal(true),
  communityRules: z.literal(true),
  botNotifications: z.boolean(),
});

export const onboardingDraftSchema = z.object({
  schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION),
  eligibility: eligibilitySchema,
  privateIdentity: privateIdentityDraftSchema,
  publicProfile: publicProfileDraftSchema,
  faithAndFamily: faithAndFamilyDraftSchema,
  partnerPreferences: partnerPreferencesDraftSchema,
  consent: consentDraftSchema,
});

export const publicOnboardingPayloadSchema = z.object({
  eligibility: eligibilitySchema,
  publicProfile: publicProfileDraftSchema,
  faithAndFamily: faithAndFamilyDraftSchema,
  partnerPreferences: partnerPreferencesDraftSchema,
});

const partialPartnerPreferencesDraftSchema = partnerPreferencesObjectSchema.partial().superRefine((value, context) => {
  if (value.ageMin !== undefined && value.ageMax !== undefined && value.ageMin > value.ageMax) {
    context.addIssue({
      code: "custom",
      message: "Minimum age must not exceed maximum age",
      path: ["ageMin"],
    });
  }
});

export const partialPublicOnboardingPayloadSchema = z
  .object({
    eligibility: eligibilitySchema.partial(),
    publicProfile: publicProfileDraftSchema.partial(),
    faithAndFamily: faithAndFamilyDraftSchema.partial(),
    partnerPreferences: partialPartnerPreferencesDraftSchema,
  })
  .partial();

export const onboardingProgressPatchSchema = z.object({
  schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION),
  expectedVersion: z.number().int().min(0),
  currentStep: onboardingStepSchema.exclude(["private_identity", "consent", "submitted"]),
  patch: partialPublicOnboardingPayloadSchema,
});

export const privateIdentitySaveRequestSchema = z.object({
  fullName: privateIdentityDraftSchema.shape.fullName,
  dateOfBirth: privateIdentityDraftSchema.shape.dateOfBirth,
  phoneNumber: privateIdentityDraftSchema.shape.phoneNumber,
});

// Private administrator verification photo. Sent as a base64 data URL, stored
// encrypted (app-layer AES-256-GCM), never projected to discovery, and purged
// 30 days after approval. Cap is generous for a JPEG data URL but bounded.
export const verificationPhotoUploadSchema = z.object({
  dataUrl: z
    .string()
    .startsWith("data:image/")
    .max(5_000_000, "Photo too large")
    .refine((value) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value), {
      message: "Photo must be a JPEG, PNG, or WebP data URL",
    }),
});

export const onboardingSubmitRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  consent: consentDraftSchema,
});

export const onboardingSubmitResponseSchema = z.object({
  status: z.literal("profile_pending"),
});

export const draftResponseSchema = z.object({
  schemaVersion: z.literal(ONBOARDING_SCHEMA_VERSION),
  currentStep: onboardingStepSchema,
  payload: partialPublicOnboardingPayloadSchema,
  version: z.number().int().min(0),
  submitted: z.boolean(),
  identityComplete: z.boolean(),
  photoComplete: z.boolean().optional(),
});

export const draftSaveResponseSchema = z.object({
  version: z.number().int().min(1),
  currentStep: onboardingStepSchema,
});

export type DraftResponse = z.infer<typeof draftResponseSchema>;
export type DraftSaveResponse = z.infer<typeof draftSaveResponseSchema>;
export type PartialPublicOnboardingPayload = z.infer<typeof partialPublicOnboardingPayloadSchema>;

export const onboardingFieldVisibility = {
  "privateIdentity.fullName": "admin_only",
  "privateIdentity.dateOfBirth": "admin_only",
  "privateIdentity.phoneNumber": "admin_only",
  "privateIdentity.verificationPhotoStatus": "admin_only",
  "publicProfile.gender": "discovery",
  "publicProfile.countryCode": "matching_only",
  "publicProfile.city": "discovery",
  "publicProfile.educationLevel": "discovery",
  "publicProfile.fieldOfStudy": "discovery",
  "publicProfile.employmentStatus": "discovery",
  "publicProfile.occupationCategory": "discovery",
  "publicProfile.maritalStatus": "discovery",
  "publicProfile.hasChildren": "discovery",
  "publicProfile.heightCm": "discovery",
  "faithAndFamily.faithTradition": "discovery",
  "faithAndFamily.marriageIntention": "discovery",
  "faithAndFamily.wantsChildren": "discovery",
  "faithAndFamily.values": "discovery",
  "faithAndFamily.bio": "discovery",
  "partnerPreferences.ageMin": "matching_only",
  "partnerPreferences.ageMax": "matching_only",
  "partnerPreferences.preferredCities": "matching_only",
  "partnerPreferences.openToAbroad": "matching_only",
  "partnerPreferences.acceptedMaritalStatuses": "matching_only",
  "partnerPreferences.acceptsPartnerWithChildren": "matching_only",
  "partnerPreferences.desiredValues": "matching_only",
  "partnerPreferences.acceptedMarriageIntentions": "matching_only",
  "partnerPreferences.additionalPreferences": "matching_only",
  contactDetails: "after_mutual_consent",
} as const satisfies Record<string, z.infer<typeof fieldVisibilitySchema>>;

export type EducationLevel = z.infer<typeof educationLevelSchema>;
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>;
export type MaritalStatus = z.infer<typeof maritalStatusSchema>;
export type MarriageIntention = z.infer<typeof marriageIntentionSchema>;
export type ValueTag = z.infer<typeof valueTagSchema>;
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export type PublicOnboardingPayload = z.infer<typeof publicOnboardingPayloadSchema>;
export type OnboardingProgressPatch = z.infer<typeof onboardingProgressPatchSchema>;
export type PrivateIdentitySaveRequest = z.infer<typeof privateIdentitySaveRequestSchema>;
export type OnboardingSubmitRequest = z.infer<typeof onboardingSubmitRequestSchema>;
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;
export type FieldVisibility = z.infer<typeof fieldVisibilitySchema>;
