import { describe, expect, it } from "vitest";
import { canAppearInDiscovery, canOpenRestrictedIntroduction } from "../src/matching/accessPolicy.js";

describe("matching access policy", () => {
  it("keeps review-pending submissions out of discovery", () => {
    expect(canAppearInDiscovery({
      candidateStatus: "profile_pending",
      profileReviewStatus: "pending",
      identityApproved: true,
      blockedInEitherDirection: false,
    })).toBe(false);
    expect(canAppearInDiscovery({
      candidateStatus: "active",
      profileReviewStatus: "approved",
      identityApproved: true,
      blockedInEitherDirection: false,
    })).toBe(true);
  });

  it("makes a block override approval and all mutual confirmations", () => {
    const otherwiseApproved = {
      candidateAInterested: true,
      candidateBInterested: true,
      administratorApproved: true,
      candidateAFinalConfirmed: true,
      candidateBFinalConfirmed: true,
      blockedInEitherDirection: false,
    };
    expect(canOpenRestrictedIntroduction(otherwiseApproved)).toBe(true);
    expect(canOpenRestrictedIntroduction({ ...otherwiseApproved, blockedInEitherDirection: true })).toBe(false);
    expect(canAppearInDiscovery({
      candidateStatus: "active",
      profileReviewStatus: "approved",
      identityApproved: true,
      blockedInEitherDirection: true,
    })).toBe(false);
  });
});
