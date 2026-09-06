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
  /** Set when reading stored receipts for export; absent on write. */
  recordedAt?: Date;
}

export interface SubmissionRecord {
  draft: DraftRecord;
  consents: SubmissionConsent[];
}

export interface VerificationPhotoInput {
  photoCiphertext: Buffer;
  mediaType: string;
  sha256: Buffer;
  now: Date;
}

export interface VerificationPhotoRecord {
  userId: string;
  photoCiphertext: Buffer;
  mediaType: string;
  uploadedAt: Date;
  approvedAt: Date | null;
  deletedAt: Date | null;
}

/** Public/non-identity data for the admin review queue (decryption happens in the service). */
export interface AdminQueueRow {
  userId: string;
  publicCode: string;
  gender: string;
  city: string;
  dateOfBirthCiphertext: Buffer;
  submittedAt: Date;
  reviewStatus: string;
  hasPhoto: boolean;
}

/** A single past review decision (note still encrypted in the repository). */
export interface AdminReviewAuditRow {
  decision: string;
  reasonCode: string | null;
  noteCiphertext: Buffer | null;
  decidedAt: Date;
}

/** Everything needed to render the admin detail view (identity still ciphertext). */
export interface AdminSubmissionRow {
  userId: string;
  publicCode: string;
  status: UserRecord["status"];
  submittedAt: Date;
  publicPayload: Record<string, unknown>;
  legalNameCiphertext: Buffer | null;
  phoneCiphertext: Buffer | null;
  dateOfBirthCiphertext: Buffer | null;
  hasPhoto: boolean;
  reviewStatus: string;
  history: AdminReviewAuditRow[];
}

export interface AdminDecisionInput {
  userId: string;
  adminId: string;
  decision: "approved" | "rejected" | "changes_requested";
  reasonCode: string | null;
  noteCiphertext: Buffer | null;
  now: Date;
}

/** The calling candidate's own review state (never another candidate's). */
export interface CandidateReviewState {
  /** Whether a discovery profile exists (i.e. the candidate has submitted at least once). */
  exists: boolean;
  /** Current discovery_profile review status, or null when no profile exists. */
  reviewStatus: "pending" | "approved" | "rejected" | "changes_requested" | null;
  /** Whether the onboarding draft is currently submitted (false while revising). */
  submitted: boolean;
  /** Latest admin feedback note, still encrypted (decrypted by the service). */
  noteCiphertext: Buffer | null;
  decidedAt: Date | null;
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
  revokeAllSessionsForUser(userId: string, now: Date): Promise<void>;
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
  saveVerificationPhoto(userId: string, input: VerificationPhotoInput): Promise<void>;
  hasVerificationPhoto(userId: string): Promise<boolean>;
  getVerificationPhoto(userId: string): Promise<VerificationPhotoRecord | null>;
  /** Returns users with approved photos whose 30-day retention window has elapsed. */
  findVerificationPhotosDueForDeletion(now: Date, retentionDays: number): Promise<string[]>;
  deleteVerificationPhoto(userId: string, now: Date): Promise<boolean>;
  // --- B3 admin review console ---
  /** Submitted profiles awaiting review (most recently submitted first). */
  listPendingSubmissions(): Promise<AdminQueueRow[]>;
  /** Full submission for the detail view, or null when the user has not submitted. */
  getSubmissionForAdmin(userId: string): Promise<AdminSubmissionRow | null>;
  /** Look up a submitted user by their public code (KD-XXXXXX); null if none. */
  findUserIdByPublicCode(publicCode: string): Promise<string | null>;
  /**
   * Records an admin decision: stamps profile_review (latest), appends an
   * admin_review audit row, and applies the lifecycle side effect:
   * approved -> discovery_profile.review_status='approved' + verification
   *   photo approved_at set (starts the 30-day retention clock) + user 'active';
   * rejected -> discovery_profile.review_status='rejected';
   * changes_requested -> discovery_profile.review_status='changes_requested'
   *   + draft reopened (submitted_at cleared) so the candidate can revise.
   */
  recordAdminDecision(input: AdminDecisionInput): Promise<void>;
  /** The calling candidate's own review state (own session only). */
  getCandidateReviewState(userId: string): Promise<CandidateReviewState | null>;
  /** Encrypted Telegram id ciphertext for notification delivery; service decrypts. */
  getCandidateTelegramIdCiphertext(userId: string): Promise<Buffer | null>;
  // --- B6 self-serve data rights ---
  /** The candidate's own identity ciphertext fields (for export); null when never saved. */
  getIdentityCiphertexts(userId: string): Promise<{
    legalNameCiphertext: Buffer | null;
    phoneCiphertext: Buffer | null;
    dateOfBirthCiphertext: Buffer | null;
  } | null>;
  /** The candidate's own consent receipts (for export). */
  listConsentReceipts(userId: string): Promise<SubmissionConsent[]>;
  /**
   * Hard-deletes the user and all personal data. Cascading FKs remove the
   * identity vault, profile, draft, sessions, photo, consents, decisions, and
   * connection rows; the audit rows tied to this subject are removed explicitly.
   * Returns false when the user does not exist.
   */
  deleteAccount(userId: string, now: Date): Promise<boolean>;
  // --- Track C: values-only discovery ---
  /**
   * Approved, discovery-eligible candidates the actor has not yet decided on,
   * excluding themselves and respecting their partner gender preference. Returns
   * the values-only projection inputs (no identity/photo).
   */
  listDiscoveryCandidates(input: {
    actorUserId: string;
    limit: number;
    offset: number;
  }): Promise<DiscoveryCandidateRow[]>;
  /** Records a pass/interested decision (idempotent on actor+target). */
  saveDiscoveryDecision(input: {
    actorUserId: string;
    targetUserId: string;
    decision: "pass" | "interested";
    idempotencyKey: string;
    now: Date;
  }): Promise<boolean>;
  /** True when the actor already has a decision for the target. */
  hasDiscoveryDecision(actorUserId: string, targetUserId: string): Promise<boolean>;
}

/** Values-only data needed to build a discovery card (no identity/photo). */
export interface DiscoveryCandidateRow {
  userId: string;
  publicCode: string;
  gender: string;
  city: string;
  educationLevel: string | null;
  occupationCategory: string | null;
  heightCm: number | null;
  marriageIntention: string | null;
  values: string[];
  bio: string | null;
  dateOfBirthCiphertext: Buffer;
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
