import { describe, expect, it } from "vitest";
import {
  buildSectionPatch,
  mergeFormFromPayload,
  publicPayloadFromForm,
  resetFormFromPayload,
  serverStepToClientStep,
} from "./draftMapping.js";
import { initialOnboardingState, syntheticOnboardingState } from "./types.js";

describe("draftMapping", () => {
  it("builds a patch containing only the current section", () => {
    const patch = buildSectionPatch(4, syntheticOnboardingState);
    expect(patch).not.toBeNull();
    expect(Object.keys(patch as Record<string, unknown>)).toEqual(["partnerPreferences"]);
    expect((patch as Record<string, unknown>).partnerPreferences).toEqual(syntheticOnboardingState.partnerPreferences);
  });

  it("returns null for non-saving steps", () => {
    expect(buildSectionPatch(5, syntheticOnboardingState)).toBeNull();
  });

  it("projects only the public onboarding payload", () => {
    const payload = publicPayloadFromForm(syntheticOnboardingState);
    expect(payload).toHaveProperty("eligibility");
    expect(payload).toHaveProperty("publicProfile");
    expect(payload).toHaveProperty("faithAndFamily");
    expect(payload).toHaveProperty("partnerPreferences");
    expect("privateIdentity" in payload).toBe(false);
    expect("consent" in payload).toBe(false);
  });

  it("merges server payload into public sections without touching identity or consent", () => {
    const serverPayload = {
      publicProfile: { city: "Bahir Dar", occupationCategory: "Education" },
      faithAndFamily: { bio: "Updated bio from server." },
    };
    const merged = mergeFormFromPayload(initialOnboardingState, serverPayload);
    expect(merged.publicProfile.city).toBe("Bahir Dar");
    expect(merged.publicProfile.occupationCategory).toBe("Education");
    expect(merged.faithAndFamily.bio).toBe("Updated bio from server.");
    expect(merged.privateIdentity.fullName).toBe(initialOnboardingState.privateIdentity.fullName);
    expect(merged.consent).toEqual(initialOnboardingState.consent);
  });

  it("ignores malformed sections instead of crashing", () => {
    const serverPayload = {
      publicProfile: { gender: "not-a-gender" },
      partnerPreferences: "oops-string",
    };
    const merged = mergeFormFromPayload(initialOnboardingState, serverPayload);
    expect(merged.publicProfile.gender).toBe(initialOnboardingState.publicProfile.gender);
    expect(merged.partnerPreferences).toEqual(initialOnboardingState.partnerPreferences);
  });

  it("maps a server step to the nearest visible client step in real mode", () => {
    expect(serverStepToClientStep("eligibility", false)).toBe(0);
    expect(serverStepToClientStep("public_profile", false)).toBe(1);
    expect(serverStepToClientStep("faith_and_family", false)).toBe(2);
    expect(serverStepToClientStep("partner_preferences", false)).toBe(3);
    expect(serverStepToClientStep("public_preview", false)).toBe(4);
  });

  it("maps all server steps in demo mode", () => {
    expect(serverStepToClientStep("eligibility", true)).toBe(0);
    expect(serverStepToClientStep("private_identity", true)).toBe(1);
    expect(serverStepToClientStep("public_profile", true)).toBe(2);
    expect(serverStepToClientStep("faith_and_family", true)).toBe(3);
    expect(serverStepToClientStep("partner_preferences", true)).toBe(4);
    expect(serverStepToClientStep("public_preview", true)).toBe(5);
    expect(serverStepToClientStep("consent", true)).toBe(6);
  });

  it("discards unsaved local edits on reload from clean defaults", () => {
    const dirty = {
      ...initialOnboardingState,
      publicProfile: { ...initialOnboardingState.publicProfile, city: "Local unsaved city" },
    };
    const serverPayload = { publicProfile: { occupationCategory: "Education" } };
    const reset = resetFormFromPayload(initialOnboardingState, serverPayload);
    expect(reset.publicProfile.occupationCategory).toBe("Education");
    expect(reset.publicProfile.city).toBe(initialOnboardingState.publicProfile.city);
    expect(dirty.publicProfile.city).toBe("Local unsaved city");
    expect(reset.privateIdentity).toEqual(initialOnboardingState.privateIdentity);
    expect(reset.consent).toEqual(initialOnboardingState.consent);
  });

  it("keeps clean defaults when the server payload is empty on reload", () => {
    const reset = resetFormFromPayload(initialOnboardingState, {});
    expect(reset.publicProfile.city).toBe(initialOnboardingState.publicProfile.city);
    expect(reset.faithAndFamily.values).toEqual(initialOnboardingState.faithAndFamily.values);
  });
});
