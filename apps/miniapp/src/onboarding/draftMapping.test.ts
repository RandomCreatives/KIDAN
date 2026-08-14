import { describe, expect, it } from "vitest";
import { buildSectionPatch, mergeFormFromPayload, publicPayloadFromForm } from "./draftMapping.js";
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
});
