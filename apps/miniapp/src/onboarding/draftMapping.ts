import { z } from "zod";
import {
  eligibilitySchema,
  faithAndFamilyDraftSchema,
  partnerPreferencesDraftSchema,
  publicProfileDraftSchema,
} from "@kidan/contracts";
import type { OnboardingFormState } from "./types.js";

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
