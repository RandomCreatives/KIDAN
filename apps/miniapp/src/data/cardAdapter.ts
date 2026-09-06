import type { DiscoveryProfile } from "@kidan/contracts";
import type { DemoProfile } from "./demoProfiles";

/**
 * Adapts a real values-only DiscoveryProfile to the DemoProfile shape the card
 * components render. No identity is added — only deterministic, non-identifying
 * presentation (abstract color + age monogram) and generic faith/family notes.
 */
export function toDemoProfile(profile: DiscoveryProfile): DemoProfile {
  // Derive a stable, abstract accent from the public code (not a photo/name).
  const seed = [...profile.publicCode].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const palette = [
    { accent: "#9d675f", surface: "#eadbd2" },
    { accent: "#5f7d9d", surface: "#d6e2ea" },
    { accent: "#6f8f6a", surface: "#dbe6d6" },
    { accent: "#9a7b4f", surface: "#ece0d0" },
    { accent: "#7d6f99", surface: "#e2dcea" },
  ];
  const visual = palette[seed % palette.length]!;

  const intentionLabel =
    profile.marriageIntention === "teklil"
      ? "Intentional about Teklil"
      : "Intentional about Orthodox marriage";

  return {
    ...profile,
    visual: { accent: visual.accent, surface: visual.surface, monogram: String(profile.age) },
    faithNote: `Faith-centered life • ${intentionLabel}`,
    familyNote: profile.marriageIntention === "teklil"
      ? "Values family • Open to growing together"
      : "Close to community • Thoughtful about family",
  };
}
