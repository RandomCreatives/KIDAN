import { randomUUID } from "node:crypto";
import type {
  AdminDecisionInput,
  AdminPendingConnectionRow,
  AdminQueueRow,
  AdminReviewAuditRow,
  AdminSubmissionRow,
  CandidateReviewState,
  DiscoveryCandidateRow,
  PersistenceRepository,
  DraftRecord,
  IdentityUpdate,
  SessionRecord,
  SubmissionConsent,
  SubmissionRecord,
  UserConnectionRow,
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
  private readonly telegramCiphertextByUser = new Map<string, Buffer>();
  private readonly latestNoteCiphertext = new Map<string, Buffer | null>();
  private readonly verificationPhotos = new Map<string, VerificationPhotoRecord>();
  private readonly reviewStatus = new Map<string, string>();
  private readonly reviewHistory = new Map<string, AdminReviewAuditRow[]>();
  private readonly consentReceipts = new Map<string, SubmissionConsent[]>();
  /** Discovery decisions: "actorId:targetId" -> decision. */
  private readonly decisions = new Map<string, "pass" | "interested">();
  /** Connections keyed by id (Track D). */
  private readonly connections = new Map<string, MemoryConnection>();
  /** Confirmation flags keyed by "connectionId:userId". */
  private readonly connectionConfirmations = new Map<string, boolean>();

  async findOrCreateUserByTelegram(input: {
    telegramLookupHash: Buffer;
    telegramCiphertext: Buffer;
    createPublicCode: () => string;
  }): Promise<UserRecord> {
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
    this.telegramCiphertextByUser.set(user.id, Buffer.from(input.telegramCiphertext));
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

  async revokeAllSessionsForUser(userId: string, now: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.user.id === userId) session.revokedAt = new Date(now);
    }
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
    if (input.consents.length > 0) {
      const stored = this.consentReceipts.get(input.userId) ?? [];
      for (const consent of input.consents) {
        stored.push({ ...consent, recordedAt: new Date(input.now) });
      }
      this.consentReceipts.set(input.userId, stored);
    }
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
    this.latestNoteCiphertext.set(input.userId, input.noteCiphertext ? Buffer.from(input.noteCiphertext) : null);

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

  async getCandidateReviewState(userId: string): Promise<CandidateReviewState | null> {
    const draft = this.drafts.get(userId);
    if (!draft) return null;
    const status = this.reviewStatus.get(userId);
    const hasProfile = status !== undefined;
    if (!hasProfile) {
      return { exists: false, reviewStatus: null, submitted: Boolean(draft.submittedAt), noteCiphertext: null, decidedAt: null };
    }
    const history = this.reviewHistory.get(userId);
    const latest = history?.[0];
    return {
      exists: true,
      reviewStatus: status as CandidateReviewState["reviewStatus"],
      submitted: Boolean(draft.submittedAt),
      noteCiphertext: this.latestNoteCiphertext.get(userId) ?? null,
      decidedAt: latest ? new Date(latest.decidedAt) : null,
    };
  }

  async getCandidateTelegramIdCiphertext(userId: string): Promise<Buffer | null> {
    return this.telegramCiphertextByUser.get(userId) ?? null;
  }

  async getIdentityCiphertexts(userId: string): Promise<{
    legalNameCiphertext: Buffer | null;
    phoneCiphertext: Buffer | null;
    dateOfBirthCiphertext: Buffer | null;
  } | null> {
    const identity = this.identities.get(userId);
    if (!this.users.has(userId)) return null;
    return {
      legalNameCiphertext: identity?.legalNameCiphertext ?? null,
      phoneCiphertext: identity?.phoneCiphertext ?? null,
      dateOfBirthCiphertext: identity?.dateOfBirthCiphertext ?? null,
    };
  }

  async listConsentReceipts(userId: string): Promise<SubmissionConsent[]> {
    return structuredClone(this.consentReceipts.get(userId) ?? []);
  }

  async deleteAccount(userId: string, _now: Date): Promise<boolean> {
    if (!this.users.has(userId)) return false;
    this.users.delete(userId);
    for (const [lookup, id] of this.telegramUsers) if (id === userId) this.telegramUsers.delete(lookup);
    this.drafts.delete(userId);
    this.completeIdentities.delete(userId);
    this.identities.delete(userId);
    this.telegramCiphertextByUser.delete(userId);
    this.verificationPhotos.delete(userId);
    this.reviewStatus.delete(userId);
    this.reviewHistory.delete(userId);
    this.latestNoteCiphertext.delete(userId);
    this.consentReceipts.delete(userId);
    // Remove this user's sessions (each session embeds the user id).
    for (const [tokenHash, session] of this.sessions) {
      if (session.user.id === userId) this.sessions.delete(tokenHash);
    }
    return true;
  }

  async listDiscoveryCandidates(input: {
    actorUserId: string;
    limit: number;
    offset: number;
  }): Promise<DiscoveryCandidateRow[]> {
    const actorDraft = this.drafts.get(input.actorUserId);
    const actorPayload = actorDraft?.publicPayload as
      | { publicProfile?: { gender?: string } }
      | undefined;
    const actorGender = actorPayload?.publicProfile?.gender;
    // Candidates the actor is looking for are the opposite gender.
    const wantedGender = actorGender === "male" ? "female" : "male";

    const rows: DiscoveryCandidateRow[] = [];
    for (const [userId, draft] of this.drafts) {
      if (userId === input.actorUserId) continue;
      if (!draft.submittedAt) continue;
      const user = this.users.get(userId);
      if (!user || user.status !== "active") continue;
      const reviewStatus = this.reviewStatus.get(userId);
      if (reviewStatus !== "approved") continue;
      if (this.decisions.has(`${input.actorUserId}:${userId}`)) continue;
      const payload = draft.publicPayload as {
        publicProfile?: {
          gender?: string; city?: string; educationLevel?: string;
          occupationCategory?: string; heightCm?: number | null;
        };
        faithAndFamily?: { marriageIntention?: string; values?: string[]; bio?: string };
      };
      const gender = payload.publicProfile?.gender;
      if (gender !== wantedGender) continue;
      const identity = this.identities.get(userId);
      rows.push({
        userId,
        publicCode: user.publicCode,
        gender: gender ?? "female",
        city: payload.publicProfile?.city ?? "",
        educationLevel: payload.publicProfile?.educationLevel ?? null,
        occupationCategory: payload.publicProfile?.occupationCategory ?? null,
        heightCm: payload.publicProfile?.heightCm ?? null,
        marriageIntention: payload.faithAndFamily?.marriageIntention ?? null,
        values: payload.faithAndFamily?.values ?? [],
        bio: payload.faithAndFamily?.bio ?? null,
        dateOfBirthCiphertext: identity?.dateOfBirthCiphertext ?? Buffer.alloc(0),
      });
    }
    return rows.slice(input.offset, input.offset + input.limit);
  }

  async saveDiscoveryDecision(input: {
    actorUserId: string;
    targetUserId: string;
    decision: "pass" | "interested";
    idempotencyKey: string;
    now: Date;
  }): Promise<boolean> {
    void input.idempotencyKey;
    void input.now;
    const key = `${input.actorUserId}:${input.targetUserId}`;
    if (this.decisions.has(key)) return false;
    this.decisions.set(key, input.decision);
    return true;
  }

  async hasDiscoveryDecision(actorUserId: string, targetUserId: string): Promise<boolean> {
    return this.decisions.has(`${actorUserId}:${targetUserId}`);
  }

  async recordDecisionAndMaybeConnect(input: {
    actorUserId: string;
    targetUserId: string;
    decision: "pass" | "interested";
    idempotencyKey: string;
    now: Date;
  }): Promise<string | null> {
    void input.idempotencyKey;
    const key = `${input.actorUserId}:${input.targetUserId}`;
    if (this.decisions.has(key)) return null;
    this.decisions.set(key, input.decision);
    if (input.decision !== "interested") return null;
    const reciprocal = this.decisions.get(`${input.targetUserId}:${input.actorUserId}`);
    if (reciprocal !== "interested") return null;
    const a = input.actorUserId < input.targetUserId ? input.actorUserId : input.targetUserId;
    const b = input.actorUserId < input.targetUserId ? input.targetUserId : input.actorUserId;
    for (const connection of this.connections.values()) {
      if (connection.userAId === a && connection.userBId === b) return null;
    }
    const id = randomUUID();
    this.connections.set(id, {
      id, userAId: a, userBId: b, status: "mutual_pending_admin",
      createdAt: new Date(input.now), updatedAt: new Date(input.now),
    });
    return id;
  }

  private valuesOnlyFields(userId: string): { code: string; dob: Buffer; city: string; gender: string } {
    const user = this.users.get(userId);
    const draft = this.drafts.get(userId);
    const identity = this.identities.get(userId);
    const payload = draft?.publicPayload as
      | { publicProfile?: { gender?: string; city?: string } }
      | undefined;
    return {
      code: user?.publicCode ?? "",
      dob: identity?.dateOfBirthCiphertext ?? Buffer.alloc(0),
      city: payload?.publicProfile?.city ?? "",
      gender: payload?.publicProfile?.gender ?? "female",
    };
  }

  async listUserConnections(userId: string): Promise<UserConnectionRow[]> {
    const rows: UserConnectionRow[] = [];
    for (const c of this.connections.values()) {
      if (c.userAId !== userId && c.userBId !== userId) continue;
      // Hidden from participants: pre-approval states. A rejection happens
      // before either user is told a match existed, so it stays invisible.
      if (c.status === "mutual_pending_admin" || c.status === "admin_rejected") continue;
      const a = this.valuesOnlyFields(c.userAId);
      const b = this.valuesOnlyFields(c.userBId);
      rows.push({
        id: c.id, status: c.status,
        userAId: c.userAId, userBId: c.userBId,
        userACode: a.code, userBCode: b.code,
        userADobCiphertext: a.dob, userBDobCiphertext: b.dob,
        userACity: a.city, userBCity: b.city,
        userAGender: a.gender, userBGender: b.gender,
        userAConfirmed: this.connectionConfirmations.get(`${c.id}:${c.userAId}`) === true,
        userBConfirmed: this.connectionConfirmations.get(`${c.id}:${c.userBId}`) === true,
        updatedAt: c.updatedAt,
      });
    }
    return rows.sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime());
  }

  async setConnectionConfirmation(input: {
    connectionId: string; userId: string; confirm: boolean; now: Date;
  }): Promise<{ status: string } | null> {
    const c = this.connections.get(input.connectionId);
    if (!c) return null;
    if (c.userAId !== input.userId && c.userBId !== input.userId) return null;
    if (c.status !== "admin_approved_pending_confirmation") return { status: c.status };
    this.connectionConfirmations.set(`${input.connectionId}:${input.userId}`, input.confirm);
    if (!input.confirm) {
      c.status = "declined";
      c.updatedAt = new Date(input.now);
      return { status: "declined" };
    }
    const both =
      this.connectionConfirmations.get(`${c.id}:${c.userAId}`) === true &&
      this.connectionConfirmations.get(`${c.id}:${c.userBId}`) === true;
    if (both) {
      c.status = "connected";
      c.updatedAt = new Date(input.now);
      return { status: "connected" };
    }
    return { status: "admin_approved_pending_confirmation" };
  }

  async listPendingConnections(): Promise<AdminPendingConnectionRow[]> {
    const rows: AdminPendingConnectionRow[] = [];
    for (const c of this.connections.values()) {
      if (c.status !== "mutual_pending_admin") continue;
      const a = this.valuesOnlyFields(c.userAId);
      const b = this.valuesOnlyFields(c.userBId);
      rows.push({
        id: c.id, userAId: c.userAId, userBId: c.userBId,
        userACode: a.code, userBCode: b.code,
        userADobCiphertext: a.dob, userBDobCiphertext: b.dob,
        userACity: a.city, userBCity: b.city,
        userAGender: a.gender, userBGender: b.gender,
        createdAt: c.createdAt,
      });
    }
    return rows.sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
  }

  async decideConnection(input: { connectionId: string; approve: boolean; now: Date }): Promise<string | null> {
    const c = this.connections.get(input.connectionId);
    if (!c || c.status !== "mutual_pending_admin") return null;
    c.status = input.approve ? "admin_approved_pending_confirmation" : "admin_rejected";
    c.updatedAt = new Date(input.now);
    return c.status;
  }
}

interface MemoryConnection {
  id: string;
  userAId: string;
  userBId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
