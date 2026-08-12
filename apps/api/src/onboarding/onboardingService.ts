import {
  consentDraftSchema,
  privateIdentitySaveRequestSchema,
  publicOnboardingPayloadSchema,
  type OnboardingProgressPatch,
  type OnboardingSubmitRequest,
  type PublicOnboardingPayload,
} from "@kidan/contracts";
import type { PersistenceRepository, DraftRecord, SubmissionConsent } from "../persistence/types.js";
import { SubmissionStateError } from "../persistence/types.js";
import { IdentityCipher } from "../security/crypto.js";

const POLICY_VERSION = "2026-08-12.v1";
const forbiddenDraftKeys = new Set(["privateIdentity", "fullName", "phoneNumber", "dateOfBirth", "telegramUserId"]);

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
    private readonly realSubmissionsEnabled: boolean,
  ) {}

  async getDraft(userId: string): Promise<DraftRecord | null> {
    return this.repository.getDraft(userId);
  }

  async hasCompletePrivateIdentity(userId: string): Promise<boolean> {
    return this.repository.hasCompletePrivateIdentity(userId);
  }

  async saveProgress(userId: string, progress: OnboardingProgressPatch, now = new Date()): Promise<DraftRecord> {
    const current = await this.repository.getDraft(userId);
    if (current?.submittedAt) throw new SubmissionStateError("DRAFT_ALREADY_SUBMITTED");
    const merged = { ...(current?.publicPayload ?? {}), ...progress.patch };
    assertNoIdentityKeys(merged);
    return this.repository.saveDraft({
      userId,
      schemaVersion: progress.schemaVersion,
      currentStep: progress.currentStep,
      publicPayload: merged,
      expectedVersion: progress.expectedVersion,
      now,
    });
  }

  async savePrivateIdentity(userId: string, input: unknown, now = new Date()): Promise<void> {
    if (!this.realSubmissionsEnabled) throw new SubmissionStateError("REAL_SUBMISSIONS_DISABLED");
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
    if (!this.realSubmissionsEnabled) throw new SubmissionStateError("REAL_SUBMISSIONS_DISABLED");
    const draft = await this.repository.getDraft(userId);
    if (!draft) throw new SubmissionStateError("DRAFT_NOT_FOUND");
    publicOnboardingPayloadSchema.parse(draft.publicPayload);
    if (!(await this.repository.hasCompletePrivateIdentity(userId))) {
      throw new SubmissionStateError("IDENTITY_INCOMPLETE");
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
}
