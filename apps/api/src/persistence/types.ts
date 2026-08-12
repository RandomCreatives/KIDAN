import type { OnboardingStep } from "@kidan/contracts";

export interface UserRecord {
  id: string;
  publicCode: string;
  status: "new" | "identity_pending" | "profile_pending" | "active" | "paused" | "suspended" | "deleted";
}

export interface SessionRecord {
  id: string;
  user: UserRecord;
  csrfTokenHash: Buffer;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface DraftRecord {
  userId: string;
  schemaVersion: string;
  currentStep: OnboardingStep;
  publicPayload: Record<string, unknown>;
  version: number;
  submittedAt: Date | null;
  updatedAt: Date;
}

export interface IdentityUpdate {
  legalNameCiphertext: Buffer;
  phoneCiphertext: Buffer;
  phoneLookupHash: Buffer;
  dateOfBirthCiphertext: Buffer;
}

export interface SubmissionConsent {
  purpose: string;
  policyVersion: string;
  granted: boolean;
}

export interface SubmissionRecord {
  draft: DraftRecord;
  consents: SubmissionConsent[];
}

export interface PersistenceRepository {
  findOrCreateUserByTelegram(input: {
    telegramLookupHash: Buffer;
    telegramCiphertext: Buffer;
    createPublicCode: () => string;
  }): Promise<UserRecord>;
  createSession(input: {
    userId: string;
    tokenHash: Buffer;
    csrfTokenHash: Buffer;
    telegramAuthDate: Date;
    expiresAt: Date;
  }): Promise<void>;
  findActiveSession(tokenHash: Buffer, now: Date): Promise<SessionRecord | null>;
  revokeSession(tokenHash: Buffer, now: Date): Promise<void>;
  touchSession(sessionId: string, now: Date): Promise<void>;
  getDraft(userId: string): Promise<DraftRecord | null>;
  saveDraft(input: {
    userId: string;
    schemaVersion: string;
    currentStep: OnboardingStep;
    publicPayload: Record<string, unknown>;
    expectedVersion: number;
    now: Date;
  }): Promise<DraftRecord>;
  savePrivateIdentity(userId: string, identity: IdentityUpdate, now: Date): Promise<void>;
  hasCompletePrivateIdentity(userId: string): Promise<boolean>;
  submitOnboarding(input: {
    userId: string;
    expectedVersion: number;
    consents: SubmissionConsent[];
    now: Date;
  }): Promise<SubmissionRecord>;
}

export class VersionConflictError extends Error {
  constructor() {
    super("DRAFT_VERSION_CONFLICT");
    this.name = "VersionConflictError";
  }
}

export class SubmissionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionStateError";
  }
}
