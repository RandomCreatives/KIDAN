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

const SERVER_STEP_TO_CANONICAL: Record<string, number> = {
  eligibility: 0,
  private_identity: 1,
  public_profile: 2,
  faith_and_family: 3,
  partner_preferences: 4,
  public_preview: 5,
  consent: 6,
};

export function serverStepToClientStep(serverStep: string, isDemo: boolean): number {
  const canonical = SERVER_STEP_TO_CANONICAL[serverStep] ?? 0;
  const active = isDemo ? [0, 1, 2, 3, 4, 5, 6] : [0, 2, 3, 4, 5];
  let best = 0;
  for (let i = 0; i < active.length; i += 1) {
    const value = active[i];
    if (value !== undefined && value <= canonical) best = i;
  }
  return best;
}

function applyPayload(
  base: OnboardingFormState,
  payload: Record<string, unknown>,
): OnboardingFormState {
  const eligibility = pickValidFields(eligibilitySchema, payload.eligibility);
  const publicProfile = pickValidFields(publicProfileDraftSchema, payload.publicProfile);
  const faithAndFamily = pickValidFields(faithAndFamilyDraftSchema, payload.faithAndFamily);
  const partnerPreferences = pickValidFields(partnerPreferencesDraftSchema, payload.partnerPreferences);

  return {
    ...base,
    ...(eligibility ? { eligibility: { ...base.eligibility, ...eligibility } } : {}),
    ...(publicProfile ? { publicProfile: { ...base.publicProfile, ...publicProfile } } : {}),
    ...(faithAndFamily ? { faithAndFamily: { ...base.faithAndFamily, ...faithAndFamily } } : {}),
    ...(partnerPreferences
      ? { partnerPreferences: { ...base.partnerPreferences, ...partnerPreferences } }
      : {}),
  } as unknown as OnboardingFormState;
}

export function mergeFormFromPayload(
  prev: OnboardingFormState,
  payload: Record<string, unknown>,
): OnboardingFormState {
  return applyPayload(prev, payload);
}

export function resetFormFromPayload(
  defaults: OnboardingFormState,
  payload: Record<string, unknown>,
): OnboardingFormState {
  return applyPayload(defaults, payload);
}
