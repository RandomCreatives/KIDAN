import { randomUUID } from "node:crypto";
import type {
  AdminDecisionInput,
  AdminQueueRow,
  AdminReviewAuditRow,
  AdminSubmissionRow,
  PersistenceRepository,
  DraftRecord,
  IdentityUpdate,
  SessionRecord,
  SubmissionConsent,
  SubmissionRecord,
  UserRecord,
  VerificationPhotoInput,
  VerificationPhotoRecord,
} from "./types.js";
import { SubmissionStateError, VersionConflictError } from "./types.js";

interface MemoryIdentity {
  legalNameCiphertext: Buffer;
  phoneCiphertext: Buffer;
  phoneLookupHash: Buffer;
  dateOfBirthCiphertext: Buffer;
}

export class MemoryPersistenceRepository implements PersistenceRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly telegramUsers = new Map<string, string>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly drafts = new Map<string, DraftRecord>();
  private readonly completeIdentities = new Set<string>();
  private readonly identities = new Map<string, MemoryIdentity>();
  private readonly verificationPhotos = new Map<string, VerificationPhotoRecord>();
  private readonly reviewStatus = new Map<string, string>();
  private readonly reviewHistory = new Map<string, AdminReviewAuditRow[]>();

  async findOrCreateUserByTelegram(input: {
    telegramLookupHash: Buffer;
    telegramCiphertext: Buffer;
    createPublicCode: () => string;
  }): Promise<UserRecord> {
    void input.telegramCiphertext;
    const lookup = input.telegramLookupHash.toString("hex");
    const existingId = this.telegramUsers.get(lookup);
    if (existingId) return structuredClone(this.users.get(existingId)!);

    const user: UserRecord = {
      id: randomUUID(),
      publicCode: input.createPublicCode(),
      status: "new",
    };
    this.users.set(user.id, user);
    this.telegramUsers.set(lookup, user.id);
    return structuredClone(user);
  }

  async createSession(input: {
    userId: string;
    tokenHash: Buffer;
    csrfTokenHash: Buffer;
    telegramAuthDate: Date;
    expiresAt: Date;
  }): Promise<void> {
    void input.telegramAuthDate;
    const user = this.users.get(input.userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    this.sessions.set(input.tokenHash.toString("hex"), {
      id: randomUUID(),
      user: structuredClone(user),
      csrfTokenHash: Buffer.from(input.csrfTokenHash),
      expiresAt: new Date(input.expiresAt),
      revokedAt: null,
    });
  }

  async findActiveSession(tokenHash: Buffer, now: Date): Promise<SessionRecord | null> {
    const session = this.sessions.get(tokenHash.toString("hex"));
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    return {
      ...session,
      user: structuredClone(this.users.get(session.user.id) ?? session.user),
      csrfTokenHash: Buffer.from(session.csrfTokenHash),
      expiresAt: new Date(session.expiresAt),
    };
  }

  async revokeSession(tokenHash: Buffer, now: Date): Promise<void> {
    const session = this.sessions.get(tokenHash.toString("hex"));
    if (session) session.revokedAt = new Date(now);
  }

  async touchSession(_sessionId: string, _now: Date): Promise<void> {}

  async getDraft(userId: string): Promise<DraftRecord | null> {
    const draft = this.drafts.get(userId);
    return draft ? structuredClone(draft) : null;
  }

  async saveDraft(input: {
    userId: string;
    schemaVersion: string;
    currentStep: DraftRecord["currentStep"];
    publicPayload: Record<string, unknown>;
    expectedVersion: number;
    now: Date;
  }): Promise<DraftRecord> {
    const current = this.drafts.get(input.userId);
    if (current?.submittedAt) throw new SubmissionStateError("DRAFT_ALREADY_SUBMITTED");
    if ((!current && input.expectedVersion !== 0) || (current && current.version !== input.expectedVersion)) {
      throw new VersionConflictError();
    }

    const next: DraftRecord = {
      userId: input.userId,
      schemaVersion: input.schemaVersion,
      currentStep: input.currentStep,
      publicPayload: structuredClone(input.publicPayload),
      version: current ? current.version + 1 : 1,
      submittedAt: null,
      updatedAt: new Date(input.now),
    };
    this.drafts.set(input.userId, next);
    return structuredClone(next);
  }

  async savePrivateIdentity(userId: string, identity: IdentityUpdate, _now: Date): Promise<void> {
    if (!this.users.has(userId)) throw new Error("USER_NOT_FOUND");
    this.completeIdentities.add(userId);
    this.identities.set(userId, {
      legalNameCiphertext: identity.legalNameCiphertext,
      phoneCiphertext: identity.phoneCiphertext,
      phoneLookupHash: identity.phoneLookupHash,
      dateOfBirthCiphertext: identity.dateOfBirthCiphertext,
    });
    this.users.get(userId)!.status = "identity_pending";
  }

  async hasCompletePrivateIdentity(userId: string): Promise<boolean> {
    return this.completeIdentities.has(userId);
  }

  async submitOnboarding(input: {
    userId: string;
    expectedVersion: number;
    consents: SubmissionConsent[];
    now: Date;
  }): Promise<SubmissionRecord> {
    const draft = this.drafts.get(input.userId);
    if (!draft) throw new SubmissionStateError("DRAFT_NOT_FOUND");
    if (draft.submittedAt) throw new SubmissionStateError("DRAFT_ALREADY_SUBMITTED");
    if (draft.version !== input.expectedVersion) throw new VersionConflictError();
    if (!this.completeIdentities.has(input.userId)) throw new SubmissionStateError("IDENTITY_INCOMPLETE");

    draft.submittedAt = new Date(input.now);
    draft.currentStep = "submitted";
    draft.version += 1;
    draft.updatedAt = new Date(input.now);
    this.reviewStatus.set(input.userId, "pending");
    this.users.get(input.userId)!.status = "profile_pending";
    return { draft: structuredClone(draft), consents: structuredClone(input.consents) };
  }

  async saveVerificationPhoto(userId: string, input: VerificationPhotoInput): Promise<void> {
    if (!this.users.has(userId)) throw new Error("USER_NOT_FOUND");
    this.verificationPhotos.set(userId, {
      userId,
      photoCiphertext: input.photoCiphertext,
      mediaType: input.mediaType,
      uploadedAt: new Date(input.now),
      approvedAt: null,
      deletedAt: null,
    });
  }

  async hasVerificationPhoto(userId: string): Promise<boolean> {
    const photo = this.verificationPhotos.get(userId);
    return Boolean(photo && photo.deletedAt === null);
  }

  async getVerificationPhoto(userId: string): Promise<VerificationPhotoRecord | null> {
    const photo = this.verificationPhotos.get(userId);
    return photo ? structuredClone(photo) : null;
  }

  async findVerificationPhotosDueForDeletion(now: Date, retentionDays: number): Promise<string[]> {
    const due: string[] = [];
    for (const [userId, photo] of this.verificationPhotos) {
      if (photo.deletedAt !== null || photo.approvedAt === null) continue;
      const deadline = new Date(photo.approvedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
      if (now >= deadline) due.push(userId);
    }
    return due;
  }

  async deleteVerificationPhoto(userId: string, now: Date): Promise<boolean> {
    const photo = this.verificationPhotos.get(userId);
    if (!photo || photo.deletedAt !== null) return false;
    // Wipe the ciphertext in place; the row remains as a tombstone/audit marker.
    photo.photoCiphertext = Buffer.alloc(0);
    photo.deletedAt = new Date(now);
    return true;
  }

  async listPendingSubmissions(): Promise<AdminQueueRow[]> {
    const rows: AdminQueueRow[] = [];
    for (const [userId, draft] of this.drafts) {
      if (!draft.submittedAt) continue;
      if (this.reviewStatus.get(userId) !== "pending") continue;
      const user = this.users.get(userId);
      const identity = this.identities.get(userId);
      const payload = draft.publicPayload as { publicProfile?: { gender?: string; city?: string } };
      const photo = this.verificationPhotos.get(userId);
      rows.push({
        userId,
        publicCode: user?.publicCode ?? "KD-UNKNOWN",
        gender: payload.publicProfile?.gender ?? "female",
        city: payload.publicProfile?.city ?? "",
        dateOfBirthCiphertext: identity?.dateOfBirthCiphertext ?? Buffer.alloc(0),
        submittedAt: new Date(draft.submittedAt),
        reviewStatus: "pending",
        hasPhoto: Boolean(photo && photo.deletedAt === null),
      });
    }
    return rows.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  }

  async findUserIdByPublicCode(publicCode: string): Promise<string | null> {
    for (const [id, user] of this.users) {
      if (user.publicCode === publicCode) return id;
    }
    return null;
  }

  async getSubmissionForAdmin(userId: string): Promise<AdminSubmissionRow | null> {
    const draft = this.drafts.get(userId);
    const user = this.users.get(userId);
    const identity = this.identities.get(userId);
    if (!draft?.submittedAt || !user) return null;
    const photo = this.verificationPhotos.get(userId);
    return {
      userId,
      publicCode: user.publicCode,
      status: user.status,
      submittedAt: new Date(draft.submittedAt),
      publicPayload: structuredClone(draft.publicPayload),
      legalNameCiphertext: identity?.legalNameCiphertext ?? null,
      phoneCiphertext: identity?.phoneCiphertext ?? null,
      dateOfBirthCiphertext: identity?.dateOfBirthCiphertext ?? null,
      hasPhoto: Boolean(photo && photo.deletedAt === null),
      reviewStatus: this.reviewStatus.get(userId) ?? "pending",
      history: structuredClone(this.reviewHistory.get(userId) ?? []),
    };
  }

  async recordAdminDecision(input: AdminDecisionInput): Promise<void> {
    const user = this.users.get(input.userId);
    const draft = this.drafts.get(input.userId);
    if (!user || !draft) throw new SubmissionStateError("SUBMISSION_NOT_FOUND");

    const audit: AdminReviewAuditRow = {
      decision: input.decision,
      reasonCode: input.reasonCode,
      noteCiphertext: input.noteCiphertext,
      decidedAt: new Date(input.now),
    };
    const history = this.reviewHistory.get(input.userId) ?? [];
    history.unshift(audit);
    this.reviewHistory.set(input.userId, history);
    this.reviewStatus.set(input.userId, input.decision);

    const photo = this.verificationPhotos.get(input.userId);
    if (input.decision === "approved") {
      user.status = "active";
      if (photo && photo.approvedAt === null && photo.deletedAt === null) {
        photo.approvedAt = new Date(input.now);
      }
    } else if (input.decision === "rejected") {
      user.status = "suspended";
    } else {
      // changes_requested: reopen the draft for editing and resubmission.
      draft.submittedAt = null;
      draft.currentStep = "public_preview";
      draft.updatedAt = new Date(input.now);
      user.status = "identity_pending";
    }
  }
}
