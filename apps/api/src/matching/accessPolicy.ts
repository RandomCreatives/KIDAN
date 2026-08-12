export interface DiscoveryAccessFacts {
  candidateStatus: "new" | "identity_pending" | "profile_pending" | "active" | "paused" | "suspended";
  profileReviewStatus: "pending" | "approved" | "rejected";
  identityApproved: boolean;
  blockedInEitherDirection: boolean;
}

export interface IntroductionAccessFacts {
  candidateAInterested: boolean;
  candidateBInterested: boolean;
  administratorApproved: boolean;
  candidateAFinalConfirmed: boolean;
  candidateBFinalConfirmed: boolean;
  blockedInEitherDirection: boolean;
}

export function canAppearInDiscovery(facts: DiscoveryAccessFacts): boolean {
  return facts.candidateStatus === "active"
    && facts.profileReviewStatus === "approved"
    && facts.identityApproved
    && !facts.blockedInEitherDirection;
}

export function canOpenRestrictedIntroduction(facts: IntroductionAccessFacts): boolean {
  return facts.candidateAInterested
    && facts.candidateBInterested
    && facts.administratorApproved
    && facts.candidateAFinalConfirmed
    && facts.candidateBFinalConfirmed
    && !facts.blockedInEitherDirection;
}
