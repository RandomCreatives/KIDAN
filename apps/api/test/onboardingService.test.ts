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

// A minimal valid-base64 JPEG data URL (content bytes are synthetic; only the
// envelope/round-trip matters for service-level testing).
function tinyJpegDataUrl(): string {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

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

  it("rejects an age-bound patch that becomes inverted after merging persisted data", async () => {
    const { repository, service, userId } = await fixture();
    await repository.saveDraft({
      userId,
      schemaVersion: completePatch.schemaVersion,
      currentStep: "partner_preferences",
      publicPayload: { partnerPreferences: { ageMin: 40 } },
      expectedVersion: 0,
      now: new Date(),
    });

    await expect(service.saveProgress(userId, {
      schemaVersion: completePatch.schemaVersion,
      expectedVersion: 1,
      currentStep: "partner_preferences",
      patch: { partnerPreferences: { ageMax: 30 } },
    })).rejects.toThrow();

    const unchanged = await repository.getDraft(userId);
    expect(unchanged).toMatchObject({
      version: 1,
      publicPayload: { partnerPreferences: { ageMin: 40 } },
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
    })).rejects.toThrow("VERIFICATION_PHOTO_REQUIRED");

    await service.saveVerificationPhoto(userId, { dataUrl: tinyJpegDataUrl() });
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

  it("stores the verification photo encrypted and decrypts it only for admin retrieval", async () => {
    const { repository, service, userId } = await fixture();
    await service.saveVerificationPhoto(userId, { dataUrl: tinyJpegDataUrl() });
    expect(await service.hasVerificationPhoto(userId)).toBe(true);

    // Stored bytes must be ciphertext, not the raw JPEG.
    const stored = await repository.getVerificationPhoto(userId);
    expect(stored).not.toBeNull();
    expect(stored!.photoCiphertext.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);

    // Admin retrieval returns the original bytes.
    const admin = await service.getVerificationPhotoForAdmin(userId);
    expect(admin?.mediaType).toBe("image/jpeg");
    expect(admin?.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("rejects a malformed or non-image photo upload", async () => {
    const { service, userId } = await fixture();
    await expect(service.saveVerificationPhoto(userId, { dataUrl: "data:text/plain;base64,SGk=" }))
      .rejects.toThrow("VERIFICATION_PHOTO_INVALID");
    await expect(service.saveVerificationPhoto(userId, { dataUrl: "not-a-data-url" }))
      .rejects.toThrow("VERIFICATION_PHOTO_INVALID");
    expect(await service.hasVerificationPhoto(userId)).toBe(false);
  });

  it("refuses photo upload when real submissions are disabled", async () => {
    const { service, userId } = await fixture(false);
    await expect(service.saveVerificationPhoto(userId, { dataUrl: tinyJpegDataUrl() }))
      .rejects.toThrow("REAL_SUBMISSIONS_DISABLED");
  });

  it("does not purge unapproved photos regardless of age (retention starts at approval)", async () => {
    const { repository, service, userId } = await fixture();
    await service.saveVerificationPhoto(userId, { dataUrl: tinyJpegDataUrl() });
    // No approval timestamp yet → nothing due even far in the future.
    expect(await repository.findVerificationPhotosDueForDeletion(new Date("2030-01-01T00:00:00Z"), 30)).toHaveLength(0);
    expect(await service.purgeExpiredVerificationPhotos(new Date("2030-01-01T00:00:00Z"))).toHaveLength(0);
    expect(await service.hasVerificationPhoto(userId)).toBe(true);
  });
});
