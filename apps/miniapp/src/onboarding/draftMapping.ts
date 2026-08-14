import { z } from "zod";
import {
  eligibilitySchema,
  faithAndFamilyDraftSchema,
  onboardingProgressPatchSchema,
  partnerPreferencesDraftSchema,
  publicProfileDraftSchema,
  type PartialPublicOnboardingPayload,
} from "@kidan/contracts";
import type { OnboardingFormState } from "./types.js";

type DraftStep = z.infer<typeof onboardingProgressPatchSchema>["currentStep"];

function pickValidFields(
  schema: z.ZodObject<z.ZodRawShape>,
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const shape = schema.shape as Record<string, z.ZodType>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    const sub = shape[key];
    if (!sub) continue;
    const raw = obj[key];
    if (raw === undefined) continue;
    const parsed = sub.safeParse(raw);
    if (parsed.success) out[key] = parsed.data as unknown;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function publicPayloadFromForm(state: OnboardingFormState): Record<string, unknown> {
  return {
    eligibility: state.eligibility,
    publicProfile: state.publicProfile,
    faithAndFamily: { faithTradition: "ethiopian_orthodox_tewahedo", ...state.faithAndFamily },
    partnerPreferences: state.partnerPreferences,
  };
}

export function buildSectionPatch(
  stepIndex: number,
  state: OnboardingFormState,
): PartialPublicOnboardingPayload | null {
  switch (stepIndex) {
    case 0:
      return { eligibility: state.eligibility } as unknown as PartialPublicOnboardingPayload;
    case 2:
      return { publicProfile: state.publicProfile };
    case 3:
      return {
        faithAndFamily: { faithTradition: "ethiopian_orthodox_tewahedo", ...state.faithAndFamily },
      } as unknown as PartialPublicOnboardingPayload;
    case 4:
      return { partnerPreferences: state.partnerPreferences };
    default:
      return null;
  }
}

export function stepToServerStep(stepIndex: number): DraftStep {
  switch (stepIndex) {
    case 0:
      return "eligibility";
    case 2:
      return "public_profile";
    case 3:
      return "faith_and_family";
    case 4:
      return "partner_preferences";
    default:
      return "public_preview";
  }
}

export function mergeFormFromPayload(
  prev: OnboardingFormState,
  payload: Record<string, unknown>,
): OnboardingFormState {
  const eligibility = pickValidFields(eligibilitySchema, payload.eligibility);
  const publicProfile = pickValidFields(publicProfileDraftSchema, payload.publicProfile);
  const faithAndFamily = pickValidFields(faithAndFamilyDraftSchema, payload.faithAndFamily);
  const partnerPreferences = pickValidFields(partnerPreferencesDraftSchema, payload.partnerPreferences);

  return {
    ...prev,
    ...(eligibility ? { eligibility: { ...prev.eligibility, ...eligibility } } : {}),
    ...(publicProfile ? { publicProfile: { ...prev.publicProfile, ...publicProfile } } : {}),
    ...(faithAndFamily ? { faithAndFamily: { ...prev.faithAndFamily, ...faithAndFamily } } : {}),
    ...(partnerPreferences
      ? { partnerPreferences: { ...prev.partnerPreferences, ...partnerPreferences } }
      : {}),
  } as unknown as OnboardingFormState;
}
