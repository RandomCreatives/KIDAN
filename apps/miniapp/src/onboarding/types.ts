import type {
  EducationLevel,
  EmploymentStatus,
  MarriageIntention,
  MaritalStatus,
  ValueTag,
} from "@kidan/contracts";

export interface OnboardingFormState {
  eligibility: {
    adultConfirmed: boolean;
    eotcConfirmed: boolean;
    marriageIntentConfirmed: boolean;
  };
  privateIdentity: {
    fullName: string;
    dateOfBirth: string;
    phoneNumber: string;
  };
  publicProfile: {
    gender: "female" | "male";
    countryCode: string;
    city: string;
    educationLevel: EducationLevel;
    fieldOfStudy: string;
    employmentStatus: EmploymentStatus;
    occupationCategory: string;
    maritalStatus: MaritalStatus;
    hasChildren: boolean;
    heightCm: number | null;
  };
  faithAndFamily: {
    marriageIntention: MarriageIntention;
    wantsChildren: "yes" | "no" | "open_to_discussion";
    values: ValueTag[];
    bio: string;
  };
  partnerPreferences: {
    ageMin: number;
    ageMax: number;
    preferredCities: string[];
    openToAbroad: boolean;
    acceptedMaritalStatuses: MaritalStatus[];
    acceptsPartnerWithChildren: boolean;
    desiredValues: ValueTag[];
    acceptedMarriageIntentions: MarriageIntention[];
    additionalPreferences: string;
  };
  consent: {
    informationAccurate: boolean;
    identityProcessing: boolean;
    faithDataProcessing: boolean;
    discoveryPublication: boolean;
    verificationPhotoRetention: boolean;
    communityRules: boolean;
    botNotifications: boolean;
  };
}

export const initialOnboardingState: OnboardingFormState = {
  eligibility: {
    adultConfirmed: false,
    eotcConfirmed: false,
    marriageIntentConfirmed: false,
  },
  privateIdentity: {
    fullName: "",
    dateOfBirth: "",
    phoneNumber: "",
  },
  publicProfile: {
    gender: "female",
    countryCode: "ET",
    city: "",
    educationLevel: "bachelors",
    fieldOfStudy: "",
    employmentStatus: "employed",
    occupationCategory: "",
    maritalStatus: "never_married",
    hasChildren: false,
    heightCm: null,
  },
  faithAndFamily: {
    marriageIntention: "teklil",
    wantsChildren: "yes",
    values: [],
    bio: "",
  },
  partnerPreferences: {
    ageMin: 25,
    ageMax: 35,
    preferredCities: ["Addis Ababa"],
    openToAbroad: false,
    acceptedMaritalStatuses: ["never_married"],
    acceptsPartnerWithChildren: false,
    desiredValues: [],
    acceptedMarriageIntentions: ["teklil"],
    additionalPreferences: "",
  },
  consent: {
    informationAccurate: false,
    identityProcessing: false,
    faithDataProcessing: false,
    discoveryPublication: false,
    verificationPhotoRetention: false,
    communityRules: false,
    botNotifications: true,
  },
};

export const syntheticOnboardingState: OnboardingFormState = {
  eligibility: {
    adultConfirmed: true,
    eotcConfirmed: true,
    marriageIntentConfirmed: true,
  },
  privateIdentity: {
    fullName: "Demo Candidate",
    dateOfBirth: "1996-04-12",
    phoneNumber: "+251 900 000 000",
  },
  publicProfile: {
    gender: "female",
    countryCode: "ET",
    city: "Addis Ababa",
    educationLevel: "bachelors",
    fieldOfStudy: "Public health",
    employmentStatus: "employed",
    occupationCategory: "Healthcare",
    maritalStatus: "never_married",
    hasChildren: false,
    heightCm: 165,
  },
  faithAndFamily: {
    marriageIntention: "teklil",
    wantsChildren: "yes",
    values: ["active_faith", "family_oriented", "communication", "compassion"],
    bio: "I value a peaceful home, thoughtful communication, and a life grounded in faith and service.",
  },
  partnerPreferences: {
    ageMin: 28,
    ageMax: 36,
    preferredCities: ["Addis Ababa", "Adama"],
    openToAbroad: false,
    acceptedMaritalStatuses: ["never_married"],
    acceptsPartnerWithChildren: false,
    desiredValues: ["active_faith", "honesty", "family_oriented"],
    acceptedMarriageIntentions: ["teklil"],
    additionalPreferences: "Kind, emotionally mature, and ready to build a faithful family life.",
  },
  consent: {
    informationAccurate: true,
    identityProcessing: true,
    faithDataProcessing: true,
    discoveryPublication: true,
    verificationPhotoRetention: true,
    communityRules: true,
    botNotifications: true,
  },
};
