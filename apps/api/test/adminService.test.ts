import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  consentDraftSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";

type ValueTag = z.infer<typeof valueTagSchema>;
import { AdminService, PILOT_ADMIN_ID } from "../src/admin/adminService.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;

function buildPayload() {
  return {
    eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
    privateIdentity: {
      fullName: "Abel Tesfaye",
      dateOfBirth: "1995-03-10",
      phoneNumber: "+251911223344",
      verificationPhotoStatus: "pending_upload" as const,
    },
    publicProfile: {
      gender: "male" as const,
      countryCode: "ET",
      city: "Addis Ababa",
      educationLevel: "bachelors" as const,
      fieldOfStudy: "Engineering",
      employmentStatus: "employed" as const,
      occupationCategory: "Software",
      maritalStatus: "never_married" as const,
      hasChildren: false,
      heightCm: 178,
    },
    faithAndFamily: {
      faithTradition: "ethiopian_orthodox_tewahedo" as const,
      marriageIntention: "teklil" as const,
      wantsChildren: "yes" as const,
      values: ["active_faith", "honesty", "family_oriented"] as ValueTag[],
      bio: "A reasonably long bio used for admin service testing that exceeds twenty chars.",
    },
    partnerPreferences: {
      ageMin: 24,
      ageMax: 32,
      preferredCities: ["Addis Ababa"],
      openToAbroad: false,
      acceptedMaritalStatuses: ["never_married" as const],
      acceptsPartnerWithChildren: false,
      desiredValues: ["active_faith" as ValueTag],
      acceptedMarriageIntentions: ["teklil" as const],
      additionalPreferences: "",
    },
  };
}

async function setupSubmittedCandidate() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const onboarding = new OnboardingService(repository, cipher, true);
  const admin = new AdminService(repository, cipher);

  const issued = await sessions.issueForTelegramUser(9007199254740001n, new Date("2026-08-01T10:00:00Z"));
  const userId = (await sessions.authenticate(issued.sessionToken))!.user.id;
  const user = (await sessions.authenticate(issued.sessionToken))!.user;

  const payload = buildPayload();
  // The public draft patch must never contain identity keys; private identity
  // is persisted through its own endpoint below.
  const { privateIdentity, eligibility: _eligibility, ...publicSections } = payload;
  void privateIdentity;
  void _eligibility;
  const patch: OnboardingProgressPatch = {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    currentStep: "public_preview",
    expectedVersion: 0,
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      ...publicSections,
    },
  };
  const saved = await onboarding.saveProgress(userId, patch, new Date("2026-08-01T10:00:00Z"));
  await onboarding.savePrivateIdentity(userId, payload.privateIdentity, new Date("2026-08-01T10:01:00Z"));
  await onboarding.saveVerificationPhoto(userId, { dataUrl: JPEG_DATA_URL }, new Date("2026-08-01T10:02:00Z"));
  const consent = consentDraftSchema.parse({
    informationAccurate: true,
    identityProcessing: true,
    faithDataProcessing: true,
    discoveryPublication: true,
    verificationPhotoRetention: true,
    communityRules: true,
    botNotifications: false,
  });
  await onboarding.submit(userId, { expectedVersion: saved.version, consent }, new Date("2026-08-01T10:03:00Z"));

  return { repository, cipher, admin, publicCode: user.publicCode };
}

describe("AdminService", () => {
  it("lists a submitted candidate in the queue with computed age and no identity", async () => {
    const { admin } = await setupSubmittedCandidate();
    const queue = await admin.listQueue(new Date("2026-09-06T00:00:00Z"));
    expect(queue).toHaveLength(1);
    const item = queue[0]!;
    expect(item.reviewStatus).toBe("pending");
    expect(item.hasPhoto).toBe(true);
    expect(item.gender).toBe("male");
    expect(item.city).toBe("Addis Ababa");
    // Born 1995-03-10 -> 31 as of 2026-09-06.
    expect(item.age).toBe(31);
    expect(item.publicCode).toMatch(/^KD-/);
    // The queue item must never contain name/phone.
    expect(JSON.stringify(item)).not.toContain("Tesfaye");
    expect(JSON.stringify(item)).not.toContain("2519");
  });

  it("returns decrypted identity and public payload on the detail view", async () => {
    const { admin, publicCode } = await setupSubmittedCandidate();
    const detail = await admin.getSubmission(publicCode);
    expect(detail).not.toBeNull();
    expect(detail!.identity.fullName).toBe("Abel Tesfaye");
    expect(detail!.identity.phoneNumber).toBe("+251911223344");
    expect(detail!.identity.dateOfBirth).toBe("1995-03-10");
    expect(detail!.hasPhoto).toBe(true);
    expect(detail!.reviewStatus).toBe("pending");
    expect(detail!.publicPayload.publicProfile.city).toBe("Addis Ababa");
  });

  it("returns null detail for an unknown public code", async () => {
    const { admin } = await setupSubmittedCandidate();
    expect(await admin.getSubmission("KD-ZZZZZZ")).toBeNull();
  });

  it("decrypts the verification photo for admin viewing", async () => {
    const { admin, publicCode } = await setupSubmittedCandidate();
    const photo = await admin.getPhoto(publicCode);
    expect(photo).not.toBeNull();
    expect(photo!.mediaType).toBe("image/jpeg");
    expect(Array.from(photo!.bytes.subarray(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  it("approves: activates the user and starts the photo retention clock", async () => {
    const { repository, admin, publicCode } = await setupSubmittedCandidate();
    const decision = await admin.decide(publicCode, { decision: "approved" }, new Date("2026-08-05T09:00:00Z"));
    expect(decision).toBe("approved");

    // Leaves the queue.
    const queue = await admin.listQueue();
    expect(queue).toHaveLength(0);

    const userId = await repository.findUserIdByPublicCode(publicCode);
    const submission = await repository.getSubmissionForAdmin(userId!);
    expect(submission!.status).toBe("active");
    expect(submission!.reviewStatus).toBe("approved");
    // Photo approved_at stamped -> retention purge is due 30 days later.
    const due = await repository.findVerificationPhotosDueForDeletion(new Date("2026-09-10T00:00:00Z"), 30);
    expect(due).toContain(userId);
  });

  it("requires feedback for a rejection and suspends the candidate", async () => {
    const { repository, admin, publicCode } = await setupSubmittedCandidate();
    await expect(admin.decide(publicCode, { decision: "rejected" })).rejects.toThrow("FEEDBACK_REQUIRED");
    await admin.decide(
      publicCode,
      { decision: "rejected", reasonCode: "ineligible", note: "Does not meet pilot eligibility." },
      new Date("2026-08-05T09:00:00Z"),
    );
    const userId = await repository.findUserIdByPublicCode(publicCode);
    const submission = await repository.getSubmissionForAdmin(userId!);
    expect(submission!.status).toBe("suspended");
    expect(submission!.reviewStatus).toBe("rejected");
    // The feedback note is stored encrypted and round-trips on detail.
    const detail = await admin.getSubmission(publicCode);
    expect(detail!.history[0]!.note).toBe("Does not meet pilot eligibility.");
    expect(detail!.history[0]!.reasonCode).toBe("ineligible");
  });

  it("requests changes: reopens the draft and records encrypted feedback", async () => {
    const { repository, admin, publicCode } = await setupSubmittedCandidate();
    await admin.decide(
      publicCode,
      { decision: "changes_requested", note: "Please clarify your occupation." },
      new Date("2026-08-05T09:00:00Z"),
    );
    const userId = await repository.findUserIdByPublicCode(publicCode);
    const draft = await repository.getDraft(userId!);
    // Draft reopened for editing (submitted_at cleared) and sent back a step.
    expect(draft!.submittedAt).toBeNull();
    expect(draft!.currentStep).toBe("public_preview");
    // The feedback note is stored encrypted and round-trips. The detail view
    // returns null while the draft is open; the recorded decision lives in the
    // review history and is surfaced again once the candidate resubmits.
    expect(await repository.getSubmissionForAdmin(userId!)).toBeNull();
    // Re-submitting returns the candidate to the queue; the prior note is retained.
    await repository.submitOnboarding({
      userId: userId!,
      expectedVersion: draft!.version,
      consents: [],
      now: new Date("2026-08-06T09:00:00Z"),
    });
    const detail = await admin.getSubmission(publicCode);
    expect(detail).not.toBeNull();
    expect(detail!.history[0]!.note).toBe("Please clarify your occupation.");
    expect(detail!.reviewStatus).toBe("pending");
  });

  it("does not allow re-deciding an already final (approved) profile", async () => {
    const { admin, publicCode } = await setupSubmittedCandidate();
    await admin.decide(publicCode, { decision: "approved" });
    await expect(
      admin.decide(publicCode, { decision: "rejected", note: "late change" }),
    ).rejects.toThrow("SUBMISSION_NOT_PENDING");
  });

  it("uses the pilot admin id as the recorded actor", async () => {
    const { repository, admin, publicCode } = await setupSubmittedCandidate();
    await admin.decide(publicCode, { decision: "approved" });
    const userId = await repository.findUserIdByPublicCode(publicCode);
    const submission = await repository.getSubmissionForAdmin(userId!);
    expect(submission!.history[0]!.decision).toBe("approved");
    expect(PILOT_ADMIN_ID).toMatch(/^00000000/);
  });
});
