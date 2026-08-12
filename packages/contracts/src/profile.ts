import { z } from "zod";

const codePattern = /^KD-[2-9A-HJ-NP-Z]{6}$/;

export const publicProfileCodeSchema = z
  .string()
  .regex(codePattern, "Invalid public profile code");

export const genderSchema = z.enum(["female", "male"]);
export const profileStatusSchema = z.enum([
  "new",
  "identity_pending",
  "profile_pending",
  "active",
  "paused",
  "suspended",
  "deleted",
]);

export const valueTagSchema = z.enum([
  "active_faith",
  "communication",
  "compassion",
  "family_oriented",
  "honesty",
  "mutual_growth",
  "patience",
  "service",
  "tradition",
]);

export const marriageIntentionSchema = z.enum([
  "teklil",
  "kidusan_kurban",
  "orthodox_church_marriage",
]);

export const discoveryProfileSchema = z.object({
  id: z.string().uuid(),
  publicCode: publicProfileCodeSchema,
  age: z.number().int().min(18).max(90),
  gender: genderSchema,
  city: z.string().min(1).max(80),
  occupationCategory: z.string().min(1).max(80).nullable(),
  educationLevel: z.string().min(1).max(80).nullable(),
  heightCm: z.number().int().min(120).max(230).nullable(),
  faithTradition: z.literal("ethiopian_orthodox_tewahedo"),
  marriageIntention: marriageIntentionSchema,
  values: z.array(valueTagSchema).min(1).max(6),
  bio: z.string().min(1).max(280),
  verified: z.boolean(),
  photoMode: z.literal("values_only"),
});

export const partnerPreferencesSchema = z
  .object({
    ageMin: z.number().int().min(18).max(90),
    ageMax: z.number().int().min(18).max(90),
    cityCodes: z.array(z.string().min(1).max(40)).max(30),
    openToAbroad: z.boolean(),
    desiredValues: z.array(valueTagSchema).max(6),
    acceptedMarriageIntentions: z.array(marriageIntentionSchema).min(1),
  })
  .refine((value) => value.ageMin <= value.ageMax, {
    message: "Minimum age must not exceed maximum age",
    path: ["ageMin"],
  });

export type DiscoveryProfile = z.infer<typeof discoveryProfileSchema>;
export type Gender = z.infer<typeof genderSchema>;
export type MarriageIntention = z.infer<typeof marriageIntentionSchema>;
export type PartnerPreferences = z.infer<typeof partnerPreferencesSchema>;
export type ProfileStatus = z.infer<typeof profileStatusSchema>;
export type ValueTag = z.infer<typeof valueTagSchema>;
