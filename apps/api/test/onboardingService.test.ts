import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OnboardingProgressPatch } from "@kidan/contracts";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const completePatch: OnboardingProgressPatch = {
  schemaVersion: "2026-08-12.v1",
  expectedVersion: 0,
  currentStep: "public_preview",
  patch: {
    eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
    publicProfile: {
      gender: "female", countryCode: "ET", city: "Addis Ababa", educationLevel: "bachelors",
      fieldOfStudy: "Public health", employmentStatus: "employed", occupationCategory: "Healthcare",
      maritalStatus: "never_married", hasChildren: false, heightCm: 165,
    },
    faithAndFamily: {
      faithTradition: "ethiopian_orthodox_tewahedo", marriageIntention: "teklil",
      wantsChildren: "yes", values: ["active_faith", "honesty", "family_oriented"],
      bio: "Synthetic information used for service-level persistence testing.",
    },
    partnerPreferences: {
      ageMin: 28, ageMax: 36, preferredCities: ["Addis Ababa"], openToAbroad: false,
      acceptedMaritalStatuses: ["never_married"], acceptsPartnerWithChildren: false,
      desiredValues: ["active_faith"], acceptedMarriageIntentions: ["teklil"], additionalPreferences: "",
    },
  },
};

async function fixture(realSubmissionsEnabled = true) {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessionService = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const issued = await sessionService.issueForTelegramUser(123n, new Date());
  const session = (await sessionService.authenticate(issued.sessionToken))!;
  return { repository, service: new OnboardingService(repository, cipher, realSubmissionsEnabled), userId: session.user.id };
}

describe("OnboardingService", () => {
  it("saves only public/matching data with optimistic versions", async () => {
    const { service, userId } = await fixture();
    const saved = await service.saveProgress(userId, completePatch);
    expect(saved.version).toBe(1);
    await expect(service.saveProgress(userId, completePatch)).rejects.toThrow("DRAFT_VERSION_CONFLICT");
    expect(JSON.stringify(saved.publicPayload)).not.toContain("phoneNumber");
  });

  it("canonicalizes persisted JSON to the public draft schema before reads and writes", async () => {
    const { repository, service, userId } = await fixture();
    await repository.saveDraft({
      userId,
      schemaVersion: completePatch.schemaVersion,
      currentStep: "public_profile",
      publicPayload: {
        publicProfile: { city: "Addis Ababa", legacyAlias: "must-not-leak" },
        legacySection: { privateNote: "must-not-leak" },
      },
      expectedVersion: 0,
      now: new Date(),
    });

    const publicDraft = await service.getDraft(userId);
    expect(publicDraft?.publicPayload).toEqual({ publicProfile: { city: "Addis Ababa" } });

    await service.saveProgress(userId, {
      schemaVersion: completePatch.schemaVersion,
      expectedVersion: 1,
      currentStep: "public_profile",
      patch: { publicProfile: { occupationCategory: "Education" } },
    });
    const persisted = await repository.getDraft(userId);
    expect(persisted?.publicPayload).toEqual({
      publicProfile: { city: "Addis Ababa", occupationCategory: "Education" },
    });
  });

  it("keeps real identity/submission paths disabled by default and enforces adult eligibility", async () => {
    const { service, userId } = await fixture(false);
    await expect(service.savePrivateIdentity(userId, {
      fullName: "Demo Candidate", dateOfBirth: "1996-01-01", phoneNumber: "+251900000000",
    })).rejects.toThrow("REAL_SUBMISSIONS_DISABLED");

    const enabled = await fixture(true);
    await expect(enabled.service.savePrivateIdentity(enabled.userId, {
      fullName: "Synthetic Minor", dateOfBirth: "2010-01-01", phoneNumber: "+251911111111",
    }, new Date("2026-08-12T00:00:00Z"))).rejects.toThrow("ADULT_ELIGIBILITY_REQUIRED");
  });

  it("requires encrypted identity and all completed sections before submission", async () => {
    const { service, userId } = await fixture();
    const saved = await service.saveProgress(userId, completePatch);
    await expect(service.submit(userId, {
      expectedVersion: saved.version,
      consent: {
        informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
        discoveryPublication: true, verificationPhotoRetention: true, communityRules: true,
        botNotifications: false,
      },
    })).rejects.toThrow("IDENTITY_INCOMPLETE");

    await service.savePrivateIdentity(userId, {
      fullName: "Demo Candidate", dateOfBirth: "1996-01-01", phoneNumber: "+251900000000",
    });
    await expect(service.submit(userId, {
      expectedVersion: saved.version,
      consent: {
        informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
        discoveryPublication: true, verificationPhotoRetention: true, communityRules: true,
        botNotifications: false,
      },
    })).resolves.toBeUndefined();

    const submitted = await service.getDraft(userId);
    expect(submitted).toMatchObject({ currentStep: "submitted", version: 2 });
    await expect(service.saveProgress(userId, {
      ...completePatch,
      expectedVersion: submitted!.version,
    })).rejects.toThrow("DRAFT_ALREADY_SUBMITTED");
  });
});
