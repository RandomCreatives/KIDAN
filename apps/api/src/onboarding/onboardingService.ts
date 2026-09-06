import { createHash } from "node:crypto";
import {
  consentDraftSchema,
  partialPublicOnboardingPayloadSchema,
  privateIdentitySaveRequestSchema,
  publicOnboardingPayloadSchema,
  verificationPhotoUploadSchema,
  type OnboardingProgressPatch,
  type OnboardingSubmitRequest,
  type PartialPublicOnboardingPayload,
  type PublicOnboardingPayload,
} from "@kidan/contracts";
import type { CandidateReviewStatus } from "@kidan/contracts";
import type { PersistenceRepository, DraftRecord, SubmissionConsent, VerificationPhotoRecord } from "../persistence/types.js";
import { SubmissionStateError } from "../persistence/types.js";
import { IdentityCipher } from "../security/crypto.js";

const POLICY_VERSION = "2026-08-12.v1";
const VERIFICATION_PHOTO_RETENTION_DAYS = 30;
const ALLOWED_PHOTO_MEDIA = new Map<string, string>([
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);
const forbiddenDraftKeys = new Set(["privateIdentity", "fullName", "phoneNumber", "dateOfBirth", "telegramUserId", "photo", "verificationPhoto"]);

function assertNoIdentityKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenDraftKeys.has(key)) throw new Error("IDENTITY_FIELD_IN_PUBLIC_DRAFT");
    assertNoIdentityKeys(child);
  }
}

export class OnboardingService {
  constructor(
    private readonly repository: PersistenceRepository,
    private readonly identityCipher: IdentityCipher,
    private readonly realSubmissionsEnabledFlag: boolean,
  ) {}

  /** Whether the deployment accepts real profile submissions (the pilot switch). */
  isRealSubmissionsEnabled(): boolean {
    return this.realSubmissionsEnabledFlag;
  }

  async getDraft(userId: string): Promise<DraftRecord | null> {
    const draft = await this.repository.getDraft(userId);
    if (!draft) return null;
    return {
      ...draft,
      // Treat persistence as an untrusted boundary. The response remains a
      // strict public-field allowlist rather than exposing legacy JSON keys.
      publicPayload: partialPublicOnboardingPayloadSchema.parse(draft.publicPayload),
    };
  }

  async hasCompletePrivateIdentity(userId: string): Promise<boolean> {
    return this.repository.hasCompletePrivateIdentity(userId);
  }

  async hasVerificationPhoto(userId: string): Promise<boolean> {
    return this.repository.hasVerificationPhoto(userId);
  }

  /**
   * Stores the candidate's private verification photo. The bytes are
   * encrypted at the application layer before persistence; only an admin-only
   * path ever decrypts them. The photo never enters the public draft payload.
   */
  async saveVerificationPhoto(userId: string, input: unknown, now = new Date()): Promise<void> {
    if (!this.realSubmissionsEnabledFlag) throw new SubmissionStateError("REAL_SUBMISSIONS_DISABLED");
    const current = await this.repository.getDraft(userId);
    if (current?.submittedAt) throw new SubmissionStateError("DRAFT_ALREADY_SUBMITTED");
    const parsed = verificationPhotoUploadSchema.safeParse(input);
    if (!parsed.success) throw new SubmissionStateError("VERIFICATION_PHOTO_INVALID");

    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(parsed.data.dataUrl);
    if (!match || match[1] === undefined || match[2] === undefined) {
      throw new SubmissionStateError("VERIFICATION_PHOTO_INVALID");
    }
    const mediaType = ALLOWED_PHOTO_MEDIA.get(match[1]);
    if (!mediaType) throw new SubmissionStateError("VERIFICATION_PHOTO_INVALID");

    const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    if (bytes.length === 0) throw new SubmissionStateError("VERIFICATION_PHOTO_INVALID");
    const ciphertext = this.identityCipher.encryptBuffer(bytes, `${userId}:verification-photo`);
    const sha256 = createHash("sha256").update(bytes).digest();
    await this.repository.saveVerificationPhoto(userId, {
      photoCiphertext: ciphertext,
      mediaType,
      sha256,
      now,
    });
  }

  /** Admin-only: decrypt the stored photo bytes for private verification. */
  async getVerificationPhotoForAdmin(userId: string): Promise<{ mediaType: string; bytes: Buffer } | null> {
    const record: VerificationPhotoRecord | null = await this.repository.getVerificationPhoto(userId);
    if (!record) return null;
    const bytes = this.identityCipher.decryptBuffer(record.photoCiphertext, `${userId}:verification-photo`);
    return { mediaType: record.mediaType, bytes };
  }

  /** Retention: wipe photos whose 30-day post-approval window has elapsed. */
  async purgeExpiredVerificationPhotos(now = new Date()): Promise<string[]> {
    const due = await this.repository.findVerificationPhotosDueForDeletion(now, VERIFICATION_PHOTO_RETENTION_DAYS);
    const purged: string[] = [];
    for (const userId of due) {
      if (await this.repository.deleteVerificationPhoto(userId, now)) purged.push(userId);
    }
    return purged;
  }

  async saveProgress(userId: string, progress: OnboardingProgressPatch, now = new Date()): Promise<DraftRecord> {
    const current = await this.repository.getDraft(userId);
    if (current?.submittedAt) throw new SubmissionStateError("DRAFT_ALREADY_SUBMITTED");
    const currentPayload = partialPublicOnboardingPayloadSchema.parse(current?.publicPayload ?? {});
    const merged: Record<string, unknown> = { ...currentPayload };
    for (const [key, section] of Object.entries(progress.patch)) {
      if (section !== null && typeof section === "object") {
        merged[key] = { ...(typeof merged[key] === "object" && merged[key] !== null ? merged[key] : {}), ...section };
      } else if (section !== undefined) {
        merged[key] = section;
      }
    }
    assertNoIdentityKeys(merged);
    const canonicalPayload: PartialPublicOnboardingPayload = partialPublicOnboardingPayloadSchema.parse(merged);
    return this.repository.saveDraft({
      userId,
      schemaVersion: progress.schemaVersion,
      currentStep: progress.currentStep,
      publicPayload: canonicalPayload,
      expectedVersion: progress.expectedVersion,
      now,
    });
  }

  async savePrivateIdentity(userId: string, input: unknown, now = new Date()): Promise<void> {
    if (!this.realSubmissionsEnabledFlag) throw new SubmissionStateError("REAL_SUBMISSIONS_DISABLED");
    const current = await this.repository.getDraft(userId);
    if (current?.submittedAt) throw new SubmissionStateError("DRAFT_ALREADY_SUBMITTED");
    const identity = privateIdentitySaveRequestSchema.parse(input);
    const birthDate = new Date(`${identity.dateOfBirth}T00:00:00.000Z`);
    const adultCutoff = new Date(Date.UTC(
      now.getUTCFullYear() - 18,
      now.getUTCMonth(),
      now.getUTCDate(),
    ));
    if (birthDate > adultCutoff) throw new SubmissionStateError("ADULT_ELIGIBILITY_REQUIRED");
    const normalizedPhone = identity.phoneNumber.replace(/[\s()-]/g, "");
    await this.repository.savePrivateIdentity(userId, {
      legalNameCiphertext: this.identityCipher.encrypt(identity.fullName.trim(), `${userId}:legal-name`),
      phoneCiphertext: this.identityCipher.encrypt(normalizedPhone, `${userId}:phone`),
      phoneLookupHash: this.identityCipher.lookupHash(`phone:${normalizedPhone}`),
      dateOfBirthCiphertext: this.identityCipher.encrypt(identity.dateOfBirth, `${userId}:date-of-birth`),
    }, now);
  }

  async submit(userId: string, request: OnboardingSubmitRequest, now = new Date()): Promise<void> {
    if (!this.realSubmissionsEnabledFlag) throw new SubmissionStateError("REAL_SUBMISSIONS_DISABLED");
    const draft = await this.repository.getDraft(userId);
    if (!draft) throw new SubmissionStateError("DRAFT_NOT_FOUND");
    publicOnboardingPayloadSchema.parse(draft.publicPayload);
    if (!(await this.repository.hasCompletePrivateIdentity(userId))) {
      throw new SubmissionStateError("IDENTITY_INCOMPLETE");
    }
    if (!(await this.repository.hasVerificationPhoto(userId))) {
      throw new SubmissionStateError("VERIFICATION_PHOTO_REQUIRED");
    }
    const consent = consentDraftSchema.parse(request.consent);
    const receipts: SubmissionConsent[] = Object.entries(consent).map(([purpose, granted]) => ({
      purpose,
      granted,
      policyVersion: POLICY_VERSION,
    }));
    await this.repository.submitOnboarding({
      userId,
      expectedVersion: request.expectedVersion,
      consents: receipts,
      now,
    });
  }

  parseCompletePayload(draft: DraftRecord): PublicOnboardingPayload {
    return publicOnboardingPayloadSchema.parse(draft.publicPayload);
  }

  /**
   * The calling candidate's OWN review status (B4). Scoped to their session,
   * so it can never expose another candidate. Derives the visible state from the
   * discovery-profile review status, draft submission flag, and the latest
   * encrypted feedback note.
   */
  async getCandidateReviewStatus(userId: string): Promise<CandidateReviewStatus> {
    const state = await this.repository.getCandidateReviewState(userId);
    if (!state || !state.exists || state.reviewStatus === null) {
      return { status: "pending", feedbackNote: null, decidedAt: null };
    }

    let status: CandidateReviewStatus["status"] = state.reviewStatus;
    // A "changes_requested" profile whose draft has been resubmitted is back in
    // the pending queue; the candidate sees "pending" with their prior note.
    if (state.reviewStatus === "changes_requested" && state.submitted) {
      status = "pending";
    }

    // Only surface the feedback note when it applies to the current state; the
    // candidate must not see a stale note after approval.
    const showNote = status === "changes_requested" || status === "rejected";
    let feedbackNote: string | null = null;
    if (showNote && state.noteCiphertext) {
      feedbackNote = this.identityCipher.decrypt(state.noteCiphertext, `${userId}:review-note`);
    }

    return {
      status,
      feedbackNote,
      decidedAt: state.decidedAt ? new Date(state.decidedAt).toISOString() : null,
    };
  }
}
