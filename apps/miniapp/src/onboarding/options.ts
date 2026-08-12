import type { MarriageIntention, MaritalStatus, ValueTag } from "@kidan/contracts";

export const valueOptions: Array<{ value: ValueTag; label: string }> = [
  { value: "active_faith", label: "Active faith" },
  { value: "family_oriented", label: "Family-oriented" },
  { value: "communication", label: "Communication" },
  { value: "honesty", label: "Honesty" },
  { value: "patience", label: "Patience" },
  { value: "compassion", label: "Compassion" },
  { value: "mutual_growth", label: "Mutual growth" },
  { value: "service", label: "Service" },
  { value: "tradition", label: "Tradition" },
];

export const maritalOptions: Array<{ value: MaritalStatus; label: string }> = [
  { value: "never_married", label: "Never married" },
  { value: "widowed", label: "Widowed" },
  { value: "civilly_divorced", label: "Civilly divorced · review required" },
  { value: "other_requires_review", label: "Other · review required" },
];

export const marriageOptions: Array<{ value: MarriageIntention; label: string }> = [
  { value: "teklil", label: "Teklil" },
  { value: "kidusan_kurban", label: "Kidusan Kurban" },
  { value: "orthodox_church_marriage", label: "Orthodox church marriage" },
];

export const cityOptions = [
  "Addis Ababa",
  "Adama",
  "Bahir Dar",
  "Debre Birhan",
  "Dire Dawa",
  "Hawassa",
];

const commonLabels: Record<string, string> = {
  secondary: "Secondary school",
  certificate: "Certificate",
  diploma: "Diploma",
  bachelors: "Bachelor’s degree",
  masters: "Master’s degree",
  doctorate: "Doctorate",
  employed: "Employed",
  self_employed: "Self-employed",
  student: "Student",
  seeking_work: "Seeking work",
  not_working: "Not working",
  yes: "Would like children",
  no: "Does not plan to have children",
  open_to_discussion: "Open to discussion",
};

export const labelFor = (value: string): string =>
  [...valueOptions, ...maritalOptions, ...marriageOptions].find((option) => option.value === value)?.label
  ?? commonLabels[value]
  ?? value.replaceAll("_", " ");
