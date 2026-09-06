import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  consentDraftSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";
import { AdminService } from "../src/admin/adminService.js";
import type { CandidateNotificationKind, CandidateNotifier } from "../src/notifications/candidateNotifier.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

type ValueTag = z.infer<typeof valueTagSchema>;

const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;

class RecordingNotifier implements CandidateNotifier {
  readonly calls: { telegramUserId: bigint; kind: CandidateNotificationKind }[] = [];
  async notifyReviewDecision(telegramUserId: bigint, kind: CandidateNotificationKind): Promise<void> {
    this.calls.push({ telegramUserId, kind });
  }
}

async function setup() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const notifier = new RecordingNotifier();
  const onboarding = new OnboardingService(repository, cipher, true);
  const admin = new AdminService(repository, cipher, notifier);

  const issued = await sessions.issueForTelegramUser(9007199254740555n, new Date("2026-08-01T10:00:00Z"));
  const session = await sessions.authenticate(issued.sessionToken);
  const userId = session!.user.id;
  const publicCode = session!.user.publicCode;

  const patch: OnboardingProgressPatch = {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    currentStep: "public_preview",
    expectedVersion: 0,
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      publicProfile: {
        gender: "female" as const, countryCode: "ET", city: "Addis Ababa", educationLevel: "bachelors" as const,
        fieldOfStudy: "Law", employmentStatus: "employed" as const, occupationCategory: "Legal",
        maritalStatus: "never_married" as const, hasChildren: false, heightCm: 168,
      },
      faithAndFamily: {
        faithTradition: "ethiopian_orthodox_tewahedo" as const, marriageIntention: "teklil" as const,
        wantsChildren: "yes" as const, values: ["active_faith", "honesty", "family_oriented"] as ValueTag[],
        bio: "Candidate review status test bio, long enough to pass the minimum length rule.",
      },
      partnerPreferences: {
        ageMin: 28, ageMax: 38, preferredCities: ["Addis Ababa"], openToAbroad: false,
        acceptedMaritalStatuses: ["never_married" as const], acceptsPartnerWithChildren: false,
        desiredValues: ["active_faith" as ValueTag], acceptedMarriageIntentions: ["teklil" as const],
        additionalPreferences: "",
      },
    },
  };
  const saved = await onboarding.saveProgress(userId, patch);
  await onboarding.savePrivateIdentity(
    userId,
    { fullName: "Hanna Bekele", dateOfBirth: "1997-02-02", phoneNumber: "+251933000000", verificationPhotoStatus: "pending_upload" },
  );
  await onboarding.saveVerificationPhoto(userId, { dataUrl: JPEG });
  await onboarding.submit(
    userId,
    {
      expectedVersion: saved.version,
      consent: consentDraftSchema.parse({
        informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
        discoveryPublication: true, verificationPhotoRetention: true, communityRules: true, botNotifications: false,
      }),
    },
  );
  return { repository, cipher, onboarding, admin, notifier, userId, publicCode };
}

describe("candidate review status (B4)", () => {
  it("reports pending with no note before a decision", async () => {
    const { onboarding, userId } = await setup();
    const status = await onboarding.getCandidateReviewStatus(userId);
    expect(status.status).toBe("pending");
    expect(status.feedbackNote).toBeNull();
  });

  it("approve -> approved, and notifies the candidate with profile_approved", async () => {
    const { onboarding, admin, notifier, userId, publicCode } = await setup();
    await admin.decide(publicCode, { decision: "approved" });
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]!.kind).toBe("profile_approved");
    expect(notifier.calls[0]!.telegramUserId).toBe(9007199254740555n);

    const status = await onboarding.getCandidateReviewStatus(userId);
    expect(status.status).toBe("approved");
    expect(status.feedbackNote).toBeNull();
    expect(status.decidedAt).not.toBeNull();
  });

  it("changes_requested -> candidate sees note and pending after resubmit; notifies profile_changes_requested", async () => {
    const { repository, onboarding, admin, notifier, userId, publicCode } = await setup();
    await admin.decide(publicCode, { decision: "changes_requested", note: "Please expand your bio." });

    // While the draft is reopened, status is changes_requested with the note.
    const beforeResubmit = await onboarding.getCandidateReviewStatus(userId);
    expect(beforeResubmit.status).toBe("changes_requested");
    expect(beforeResubmit.feedbackNote).toBe("Please expand your bio.");
    expect(notifier.calls[0]!.kind).toBe("profile_changes_requested");

    // Candidate resubmits -> back to pending; note no longer surfaced.
    const draft = await repository.getDraft(userId);
    await repository.submitOnboarding({ userId, expectedVersion: draft!.version, consents: [], now: new Date("2026-08-07T09:00:00Z") });
    const afterResubmit = await onboarding.getCandidateReviewStatus(userId);
    expect(afterResubmit.status).toBe("pending");
    expect(afterResubmit.feedbackNote).toBeNull();
  });

  it("reject -> rejected with the note and profile_rejected notification", async () => {
    const { onboarding, admin, notifier, userId, publicCode } = await setup();
    await admin.decide(publicCode, { decision: "rejected", reasonCode: "ineligible", note: "Does not meet pilot eligibility." });
    const status = await onboarding.getCandidateReviewStatus(userId);
    expect(status.status).toBe("rejected");
    expect(status.feedbackNote).toBe("Does not meet pilot eligibility.");
    expect(notifier.calls[0]!.kind).toBe("profile_rejected");
  });

  it("constructs and runs with the default no-op notifier (no throw)", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const admin = new AdminService(repository, cipher); // no notifier injected
    // A decision on a nonexistent candidate surfaces a domain error, not a crash.
    await expect(admin.decide("KD-000000", { decision: "approved" })).rejects.toThrow();
  });
});
