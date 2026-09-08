import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { Jimp } from "jimp";
import { z } from "zod";
import {
  consentDraftSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";
import { AdminService } from "../src/admin/adminService.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

describe("Verification-photo retention Option A (thumbnail on approval)", () => {
  let repo: MemoryPersistenceRepository;
  let cipher: IdentityCipher;
  let onboarding: OnboardingService;

  beforeEach(() => {
    repo = new MemoryPersistenceRepository();
    cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    onboarding = new OnboardingService(repo, cipher, true);
  });

  async function seedApprovedCandidateWithFullRes(): Promise<string> {
    const sessions = new SessionService(repo, cipher, new SecretHasher(randomBytes(32)));
    const issued = await sessions.issueForTelegramUser(9007199254740099n, new Date("2026-09-01T10:00:00Z"));
    const session = await sessions.authenticate(issued.sessionToken);
    const userId = session!.user.id;
    const publicCode = session!.user.publicCode;

    // A genuinely decodable, full-resolution JPEG (~600x400).
    const fullRes = new Jimp({ width: 600, height: 400, color: 0x2e7d32ff });
    const jpeg = await fullRes.getBuffer("image/jpeg");
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

    const patch: OnboardingProgressPatch = {
      schemaVersion: ONBOARDING_SCHEMA_VERSION,
      currentStep: "public_preview",
      expectedVersion: 0,
      patch: {
        eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
        publicProfile: {
          gender: "male", countryCode: "ET", city: "Addis Ababa", educationLevel: "bachelors" as const,
          fieldOfStudy: "Engineering", employmentStatus: "employed" as const, occupationCategory: "Engineering",
          maritalStatus: "never_married" as const, hasChildren: false, heightCm: 175,
        },
        faithAndFamily: {
          faithTradition: "ethiopian_orthodox_tewahedo" as const, marriageIntention: "teklil" as const,
          wantsChildren: "yes" as const, values: ["active_faith", "honesty", "family_oriented"] as z.infer<typeof valueTagSchema>[],
          bio: "Long enough bio text for admin verification retention testing.",
          hasGodfather: true, isDeacon: false, churchServiceActive: true, hasDisability: false,
        },
        partnerPreferences: {
          ageMin: 24, ageMax: 34, preferredCities: ["Addis Ababa"], openToAbroad: false,
          acceptedMaritalStatuses: ["never_married" as const], acceptsPartnerWithChildren: false,
          desiredValues: ["honesty" as z.infer<typeof valueTagSchema>], acceptedMarriageIntentions: ["teklil" as const], additionalPreferences: "",
        },
      },
    };
    const saved = await onboarding.saveProgress(userId, patch, new Date("2026-09-01T10:00:00Z"));
    await onboarding.savePrivateIdentity(
      userId,
      { fullName: "Dawit Bekele", dateOfBirth: "1995-03-12", phoneNumber: "+251911000001", verificationPhotoStatus: "pending_upload" },
      new Date("2026-09-01T10:01:00Z"),
    );
    await onboarding.saveVerificationPhoto(userId, { dataUrl }, new Date("2026-09-01T10:02:00Z"));
    await onboarding.submit(
      userId,
      { expectedVersion: saved.version, consent: consentDraftSchema.parse({
        informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
        discoveryPublication: true, verificationPhotoRetention: true, communityRules: true, botNotifications: false,
      }) },
      new Date("2026-09-01T10:03:00Z"),
    );
    return publicCode;
  }

  async function photo(userId: string) {
    return repo.getVerificationPhoto(userId);
  }
  async function decryptedUserId(publicCode: string): Promise<string> {
    const id = await repo.findUserIdByPublicCode(publicCode);
    if (!id) throw new Error("no user");
    return id;
  }

  it("replaces the full-res photo with a small JPEG thumbnail on approval", async () => {
    const publicCode = await seedApprovedCandidateWithFullRes();
    const userId = await decryptedUserId(publicCode);
    const before = await photo(userId);
    expect(before!.mediaType).toBe("image/jpeg");
    const beforeBytes = cipher.decryptBuffer(before!.photoCiphertext, `${userId}:verification-photo`);
    const beforeJimp = await Jimp.fromBuffer(beforeBytes);
    expect(beforeJimp.bitmap.width).toBe(600);

    const admin = new AdminService(repo, cipher);
    await admin.decide(publicCode, { decision: "approved", reasonCode: "candidate_verified", note: "" }, new Date("2026-09-01T11:00:00Z"));

    const after = await photo(userId);
    expect(after!.approvedAt).not.toBeNull();
    expect(after!.mediaType).toBe("image/jpeg");
    const afterBytes = cipher.decryptBuffer(after!.photoCiphertext, `${userId}:verification-photo`);
    const afterJimp = await Jimp.fromBuffer(afterBytes);
    expect(Math.max(afterJimp.bitmap.width, afterJimp.bitmap.height)).toBeLessThanOrEqual(240);
    expect(afterBytes.length).toBeLessThan(beforeBytes.length);
  });

  it("does not degrade the photo on a non-approval decision", async () => {
    const publicCode = await seedApprovedCandidateWithFullRes();
    const userId = await decryptedUserId(publicCode);
    const before = await photo(userId);
    const beforeBytes = cipher.decryptBuffer(before!.photoCiphertext, `${userId}:verification-photo`);

    const admin = new AdminService(repo, cipher);
    await admin.decide(publicCode, { decision: "changes_requested", note: "please re-upload" }, new Date("2026-09-01T11:00:00Z"));

    const after = await photo(userId);
    const afterBytes = cipher.decryptBuffer(after!.photoCiphertext, `${userId}:verification-photo`);
    expect(afterBytes.equals(beforeBytes)).toBe(true);
  });
});
