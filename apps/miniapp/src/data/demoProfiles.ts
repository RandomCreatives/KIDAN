import type { DiscoveryProfile } from "@kidan/contracts";

export interface DemoProfile extends DiscoveryProfile {
  visual: {
    accent: string;
    surface: string;
    monogram: string;
  };
  faithNote: string;
  familyNote: string;
}

export const demoProfiles: DemoProfile[] = [
  {
    id: "68d44db3-5e31-44c6-8282-4d06ca1f3f68",
    publicCode: "KD-7M4Q9X",
    age: 27,
    gender: "female",
    city: "Addis Ababa",
    occupationCategory: "Healthcare",
    educationLevel: "Bachelor’s degree",
    heightCm: 163,
    faithTradition: "ethiopian_orthodox_tewahedo",
    marriageIntention: "teklil",
    values: ["active_faith", "family_oriented", "communication", "compassion"],
    bio: "I value a peaceful home, thoughtful conversation, and a life grounded in faith and service.",
    verified: true,
    photoMode: "values_only",
    visual: { accent: "#9d675f", surface: "#eadbd2", monogram: "27" },
    faithNote: "Faith-centered life • Intentional about Teklil",
    familyNote: "Close to family • Open to growing together",
  },
  {
    id: "f2b2ba15-e6af-41fb-ad8a-269c67d25e56",
    publicCode: "KD-R8H2WP",
    age: 30,
    gender: "male",
    city: "Adama",
    occupationCategory: "Education",
    educationLevel: "Master’s degree",
    heightCm: 178,
    faithTradition: "ethiopian_orthodox_tewahedo",
    marriageIntention: "orthodox_church_marriage",
    values: ["honesty", "patience", "tradition", "mutual_growth"],
    bio: "A calm and purposeful person who values honesty, learning, and building a respectful family life.",
    verified: true,
    photoMode: "values_only",
    visual: { accent: "#456f6a", surface: "#d5e2de", monogram: "30" },
    faithNote: "Orthodox Christian • Church marriage intention",
    familyNote: "Marriage-minded • Values mutual respect",
  },
  {
    id: "b2bc7571-c5a3-4de1-ab37-ec97c7b12886",
    publicCode: "KD-3N7F6C",
    age: 29,
    gender: "female",
    city: "Bahir Dar",
    occupationCategory: "Business",
    educationLevel: "Bachelor’s degree",
    heightCm: 166,
    faithTradition: "ethiopian_orthodox_tewahedo",
    marriageIntention: "kurban",
    values: ["active_faith", "service", "honesty", "family_oriented"],
    bio: "Community, faith, and kindness shape my days. I hope to build a steady partnership with shared purpose.",
    verified: true,
    photoMode: "values_only",
    visual: { accent: "#806b99", surface: "#e3ddeb", monogram: "29" },
    faithNote: "Active faith • Values service and prayer",
    familyNote: "Ready for commitment • Open to relocation",
  },
];
