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

// Marriage goal in the Ethiopian Orthodox Tewahedo tradition:
//  - teklil: Holy Matrimony (ተክሊል)
//  - kidusan_kurban: Holy Communion (ቅዱስ ቁርባን)
//  - either: open to either Holy Matrimony or Holy Communion
// (orthodox_church_marriage retained for backward compatibility.)
export const marriageIntentionSchema = z.enum([
  "teklil",
  "kidusan_kurban",
  "either",
  "orthodox_church_marriage",
]);

// First-pilot eligibility window: adult Ethiopian Orthodox candidates aged
// 21–45 (the pilot does not admit 18–20 or over-45 candidates).
export const PILOT_AGE_MIN = 21;
export const PILOT_AGE_MAX = 45;

export const discoveryProfileSchema = z.object({
  id: publicProfileCodeSchema,
  publicCode: publicProfileCodeSchema,
  age: z.number().int().min(PILOT_AGE_MIN).max(PILOT_AGE_MAX),
  gender: genderSchema,
  city: z.string().min(1).max(80),
  occupationCategory: z.string().min(1).max(80).nullable(),
  educationLevel: z.string().min(1).max(80).nullable(),
  heightCm: z.number().int().min(120).max(230).nullable(),
  faithTradition: z.literal("ethiopian_orthodox_tewahedo"),
  marriageIntention: marriageIntentionSchema,
  values: z.array(valueTagSchema).min(1).max(6),
  bio: z.string().min(1).max(280),
  // Pilot faith basics shown on the values-only card/summary (Track D2).
  hasGodfather: z.boolean(),
  isDeacon: z.boolean().nullable(),
  churchServiceActive: z.boolean(),
  verified: z.boolean(),
  photoMode: z.literal("values_only"),
});

export const partnerPreferencesSchema = z
  .object({
    ageMin: z.number().int().min(PILOT_AGE_MIN).max(PILOT_AGE_MAX),
    ageMax: z.number().int().min(PILOT_AGE_MIN).max(PILOT_AGE_MAX),
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
export type PartnerPreferences = z.infer<typeof partnerPreferencesSchema>;
