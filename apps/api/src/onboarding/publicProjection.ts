import { discoveryProfileSchema, type DiscoveryProfile, type PublicOnboardingPayload } from "@kidan/contracts";

export function buildDiscoveryProjection(input: {
  publicCode: string;
  age: number;
  payload: PublicOnboardingPayload;
  verified: boolean;
}): DiscoveryProfile {
  return discoveryProfileSchema.parse({
    id: input.publicCode,
    publicCode: input.publicCode,
    age: input.age,
    gender: input.payload.publicProfile.gender,
    city: input.payload.publicProfile.city,
    occupationCategory: input.payload.publicProfile.occupationCategory || null,
    educationLevel: input.payload.publicProfile.educationLevel,
    heightCm: input.payload.publicProfile.heightCm,
    faithTradition: "ethiopian_orthodox_tewahedo",
    marriageIntention: input.payload.faithAndFamily.marriageIntention,
    values: input.payload.faithAndFamily.values,
    bio: input.payload.faithAndFamily.bio,
    verified: input.verified,
    photoMode: "values_only",
  });
}
