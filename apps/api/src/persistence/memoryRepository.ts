import { randomUUID } from "node:crypto";
import type {
  AdminDecisionInput,
  AdminIntroductionMessageRow,
  AdminPendingConnectionRow,
  AdminQueueRow,
  AdminReviewAuditRow,
  AdminSubmissionRow,
  CandidateReviewState,
  DiscoveryCandidateRow,
  PersistenceRepository,
  DraftRecord,
  IdentityUpdate,
  IntroductionMessageRow,
  IntroductionRequestRow,
  IntroductionThreadRow,
  SessionRecord,
  SubmissionConsent,
  SubmissionRecord,
  UserConnectionRow,
  UserRecord,
  VerificationPhotoInput,
  VerificationPhotoRecord,
} from "./types.js";

type UserIntroductionThread = IntroductionThreadRow;
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
  /** Introduction messages keyed by id (Track D3). */
  private readonly introductionMessages = new Map<string, MemoryIntroductionMessage>();
  /** Intentional introduction requests keyed by id (Track D2). */
  private readonly introductionRequests = new Map<string, MemoryIntroductionRequest>();
  /** Append-only operational events keyed by id (Track E3): { action, occurredAt }. */
  private readonly operationalEvents = new Map<string, { action: string; occurredAt: Date }>();
  private operationalEventCounter = 0;

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

  async countAdmittedCandidates(): Promise<number> {
    let count = 0;
    for (const user of this.users.values()) {
      if (user.status === "profile_pending" || user.status === "active") count += 1;
    }
    return count;
  }

  async getUserStatus(userId: string): Promise<UserRecord["status"] | null> {
    return this.users.get(userId)?.status ?? null;
  }

  async recordOperationalEvent(event: string, now: Date): Promise<void> {
    this.operationalEventCounter += 1;
    this.operationalEvents.set(String(this.operationalEventCounter), { action: event, occurredAt: now });
  }

  async countOperationalEventsSince(events: string[], since: Date): Promise<number> {
    let count = 0;
    for (const event of this.operationalEvents.values()) {
      if (events.includes(event.action) && event.occurredAt >= since) count += 1;
    }
    return count;
  }

  async getFunnelCounts(): Promise<{
    submitted: number;
    approved: number;
    shortlisted: number;
    requestsPending: number;
    requestsAccepted: number;
    requestsDeclined: number;
    requestsExpired: number;
    connectionsPendingAdmin: number;
    connectionsConnected: number;
    connectionsDeclined: number;
    connectionsRejected: number;
  }> {
    let submitted = 0;
    let approved = 0;
    for (const draft of this.drafts.values()) {
      if (draft.submittedAt) submitted += 1;
    }
    for (const status of this.reviewStatus.values()) {
      if (status === "approved") approved += 1;
    }
    let shortlisted = 0;
    for (const decision of this.decisions.values()) {
      if (decision === "interested") shortlisted += 1;
    }
    let requestsPending = 0;
    let requestsAccepted = 0;
    let requestsDeclined = 0;
    let requestsExpired = 0;
    for (const request of this.introductionRequests.values()) {
      if (request.status === "pending") requestsPending += 1;
      else if (request.status === "accepted") requestsAccepted += 1;
      else if (request.status === "declined") requestsDeclined += 1;
      else if (request.status === "expired") requestsExpired += 1;
    }
    let connectionsPendingAdmin = 0;
    let connectionsConnected = 0;
    let connectionsDeclined = 0;
    let connectionsRejected = 0;
    for (const connection of this.connections.values()) {
      if (connection.status === "mutual_confirmed_pending_admin") connectionsPendingAdmin += 1;
      else if (connection.status === "connected") connectionsConnected += 1;
      else if (connection.status === "declined") connectionsDeclined += 1;
      else if (connection.status === "admin_rejected") connectionsRejected += 1;
    }
    return {
      submitted,
      approved,
      shortlisted,
      requestsPending,
      requestsAccepted,
      requestsDeclined,
      requestsExpired,
      connectionsPendingAdmin,
      connectionsConnected,
      connectionsDeclined,
      connectionsRejected,
    };
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

  async getDiscoveryGender(userId: string): Promise<string | null> {
    const draft = this.drafts.get(userId);
    const gender = (draft?.publicPayload as
      | { publicProfile?: { gender?: string } }
      | undefined)?.publicProfile?.gender;
    return gender ?? null;
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
        faithAndFamily?: {
          marriageIntention?: string; values?: string[]; bio?: string;
          hasGodfather?: boolean; isDeacon?: boolean | null; churchServiceActive?: boolean;
        };
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
        hasGodfather: payload.faithAndFamily?.hasGodfather ?? false,
        isDeacon: payload.faithAndFamily?.isDeacon ?? null,
        churchServiceActive: payload.faithAndFamily?.churchServiceActive ?? false,
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
    // Track D2: a right swipe is a private shortlist entry only; it never
    // creates a connection. Connections are born solely from an accepted
    // intentional introduction request.
    return null;
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
      // Hidden from participants: pre-acceptance / pre-approval states. A
      // rejection happens before either user is told a match existed, so it
      // stays invisible. The admin queue state ('mutual_confirmed_pending_admin')
      // is also internal: participants are confirming, not awaiting admin.
      if (
        c.status === "mutual_pending_admin"
        || c.status === "mutual_confirmed_pending_admin"
        || c.status === "admin_rejected"
      ) continue;
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
    // Track D2: pair confirms FIRST (request_accepted_pending_confirmation),
    // then admin acts LAST. Legacy admin-first flow retained for in-flight rows.
    const confirmable =
      c.status === "request_accepted_pending_confirmation"
      || c.status === "admin_approved_pending_confirmation";
    if (!confirmable) return { status: c.status };
    const fromStatus = c.status;
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
      if (fromStatus === "request_accepted_pending_confirmation") {
        c.status = "mutual_confirmed_pending_admin";
        c.updatedAt = new Date(input.now);
        return { status: "mutual_confirmed_pending_admin" };
      }
      c.status = "connected";
      c.updatedAt = new Date(input.now);
      return { status: "connected" };
    }
    return { status: fromStatus };
  }

  async listPendingConnections(): Promise<AdminPendingConnectionRow[]> {
    const rows: AdminPendingConnectionRow[] = [];
    for (const c of this.connections.values()) {
      if (c.status !== "mutual_confirmed_pending_admin") continue;
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
    if (!c) return null;
    // Track D2: administrator acts LAST on a pair both participants confirmed.
    if (c.status === "mutual_confirmed_pending_admin") {
      c.status = input.approve ? "connected" : "admin_rejected";
      c.updatedAt = new Date(input.now);
      if (input.approve) this.deletePairRecords(c.userAId, c.userBId);
      return c.status;
    }
    // Legacy admin-first (mutual swipe) flow.
    if (c.status !== "mutual_pending_admin") return null;
    c.status = input.approve ? "admin_approved_pending_confirmation" : "admin_rejected";
    c.updatedAt = new Date(input.now);
    return c.status;
  }

  /** Data minimization: remove swipe + request records for a connected pair. */
  private deletePairRecords(a: string, b: string): void {
    this.decisions.delete(`${a}:${b}`);
    this.decisions.delete(`${b}:${a}`);
    for (const [id, req] of this.introductionRequests) {
      const pair =
        (req.senderUserId === a && req.recipientUserId === b)
        || (req.senderUserId === b && req.recipientUserId === a);
      if (pair) this.introductionRequests.delete(id);
    }
  }

  async getIntroductionThread(input: {
    connectionId: string;
    viewerId: string;
    now: Date;
  }): Promise<UserIntroductionThread | null> {
    void input.now;
    const c = this.connections.get(input.connectionId);
    if (!c || c.status !== "connected") return null;
    if (c.userAId !== input.viewerId && c.userBId !== input.viewerId) return null;
    const viewerIsA = c.userAId === input.viewerId;
    const otherId = viewerIsA ? c.userBId : c.userAId;
    const otherUser = this.users.get(otherId);
    const otherDraft = this.drafts.get(otherId);
    const otherIdentity = this.identities.get(otherId);
    const payload = otherDraft?.publicPayload as
      | {
          publicProfile?: {
            gender?: string; city?: string; educationLevel?: string;
            occupationCategory?: string; heightCm?: number | null;
          };
          faithAndFamily?: {
            marriageIntention?: string; values?: string[]; bio?: string;
            hasGodfather?: boolean; isDeacon?: boolean | null; churchServiceActive?: boolean;
          };
        }
      | undefined;
    const messages = [...this.introductionMessages.values()]
      .filter((m) => m.connectionId === input.connectionId)
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
      .map((m) => ({
        id: m.id,
        senderUserId: m.senderUserId,
        body: m.hidden ? "" : m.body,
        hidden: m.hidden,
        createdAt: m.createdAt,
      }));
    return {
      connectionId: input.connectionId,
      status: c.status,
      viewerIsA,
      other: {
        userId: otherId,
        publicCode: otherUser?.publicCode ?? "",
        dateOfBirthCiphertext: otherIdentity?.dateOfBirthCiphertext ?? Buffer.alloc(0),
        gender: payload?.publicProfile?.gender ?? "female",
        city: payload?.publicProfile?.city ?? "",
        educationLevel: payload?.publicProfile?.educationLevel ?? null,
        occupationCategory: payload?.publicProfile?.occupationCategory ?? null,
        heightCm: payload?.publicProfile?.heightCm ?? null,
        marriageIntention: payload?.faithAndFamily?.marriageIntention ?? null,
        values: payload?.faithAndFamily?.values ?? [],
        bio: payload?.faithAndFamily?.bio ?? null,
        hasGodfather: payload?.faithAndFamily?.hasGodfather ?? false,
        isDeacon: payload?.faithAndFamily?.isDeacon ?? null,
        churchServiceActive: payload?.faithAndFamily?.churchServiceActive ?? false,
      },
      messages,
    };
  }

  async addIntroductionMessage(input: {
    connectionId: string;
    senderUserId: string;
    body: string;
    now: Date;
  }): Promise<{ id: string; senderUserId: string; body: string; hidden: boolean; createdAt: Date }> {
    const c = this.connections.get(input.connectionId);
    if (!c || c.status !== "connected") throw new SubmissionStateError("INTRODUCTION_NOT_OPEN");
    if (c.userAId !== input.senderUserId && c.userBId !== input.senderUserId) {
      throw new SubmissionStateError("INTRODUCTION_NOT_OPEN");
    }
    const id = randomUUID();
    const message = {
      id,
      connectionId: input.connectionId,
      senderUserId: input.senderUserId,
      body: input.body,
      hidden: false,
      createdAt: new Date(input.now),
    };
    this.introductionMessages.set(id, message);
    return message;
  }

  async listRecentIntroductionMessages(limit: number): Promise<AdminIntroductionMessageRow[]> {
    return [...this.introductionMessages.values()]
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
      .slice(0, limit)
      .map((m) => ({
        id: m.id,
        connectionId: m.connectionId,
        senderCode: this.users.get(m.senderUserId)?.publicCode ?? "",
        body: m.body,
        hidden: m.hidden,
        createdAt: m.createdAt,
      }));
  }

  async hideIntroductionMessage(messageId: string): Promise<boolean> {
    const message = this.introductionMessages.get(messageId);
    if (!message || message.hidden) return false;
    message.hidden = true;
    return true;
  }

  // --- Track D2: intentional introduction requests ---

  async createIntroductionRequest(input: {
    senderUserId: string;
    recipientUserId: string;
    idempotencyKey: string;
    now: Date;
    ttlHours: number;
  }): Promise<{ id: string; status: string } | { duplicate: true; id: string; status: string }> {
    void input.idempotencyKey;
    for (const req of this.introductionRequests.values()) {
      if (req.senderUserId !== input.senderUserId || req.recipientUserId !== input.recipientUserId) continue;
      if (req.status === "pending" || req.status === "accepted") {
        return { duplicate: true, id: req.id, status: req.status };
      }
      // Terminal (declined/expired): replace with a fresh pending request.
      req.status = "pending";
      req.createdAt = new Date(input.now);
      req.expiresAt = new Date(input.now.getTime() + input.ttlHours * 60 * 60 * 1000);
      req.respondedAt = null;
      return { id: req.id, status: req.status };
    }
    const req: MemoryIntroductionRequest = {
      id: randomUUID(),
      senderUserId: input.senderUserId,
      recipientUserId: input.recipientUserId,
      status: "pending",
      createdAt: new Date(input.now),
      expiresAt: new Date(input.now.getTime() + input.ttlHours * 60 * 60 * 1000),
      respondedAt: null,
    };
    this.introductionRequests.set(req.id, req);
    return { id: req.id, status: req.status };
  }

  async countRequestsSince(senderUserId: string, since: Date): Promise<number> {
    let n = 0;
    for (const req of this.introductionRequests.values()) {
      if (req.senderUserId === senderUserId && req.createdAt >= since) n += 1;
    }
    return n;
  }

  private requestRow(req: MemoryIntroductionRequest, otherUserId: string): IntroductionRequestRow {
    const user = this.users.get(otherUserId);
    const draft = this.drafts.get(otherUserId);
    const identity = this.identities.get(otherUserId);
    const payload = draft?.publicPayload as
      | {
          publicProfile?: {
            gender?: string; city?: string; educationLevel?: string;
            occupationCategory?: string; heightCm?: number | null;
          };
          faithAndFamily?: {
            marriageIntention?: string; values?: string[]; bio?: string;
            hasGodfather?: boolean; isDeacon?: boolean | null; churchServiceActive?: boolean;
          };
        }
      | undefined;
    return {
      id: req.id,
      status: req.status,
      senderUserId: req.senderUserId,
      recipientUserId: req.recipientUserId,
      createdAt: req.createdAt,
      expiresAt: req.expiresAt,
      other: {
        userId: otherUserId,
        publicCode: user?.publicCode ?? "",
        dateOfBirthCiphertext: identity?.dateOfBirthCiphertext ?? Buffer.alloc(0),
        gender: payload?.publicProfile?.gender ?? "female",
        city: payload?.publicProfile?.city ?? "",
        educationLevel: payload?.publicProfile?.educationLevel ?? null,
        occupationCategory: payload?.publicProfile?.occupationCategory ?? null,
        heightCm: payload?.publicProfile?.heightCm ?? null,
        marriageIntention: payload?.faithAndFamily?.marriageIntention ?? null,
        values: payload?.faithAndFamily?.values ?? [],
        bio: payload?.faithAndFamily?.bio ?? null,
        hasGodfather: payload?.faithAndFamily?.hasGodfather ?? false,
        isDeacon: payload?.faithAndFamily?.isDeacon ?? null,
        churchServiceActive: payload?.faithAndFamily?.churchServiceActive ?? false,
      },
    };
  }

  async listIncomingRequests(recipientUserId: string, now: Date): Promise<IntroductionRequestRow[]> {
    const rows: IntroductionRequestRow[] = [];
    for (const req of this.introductionRequests.values()) {
      if (req.recipientUserId !== recipientUserId) continue;
      if (req.status !== "pending" || req.expiresAt <= now) continue;
      rows.push(this.requestRow(req, req.senderUserId));
    }
    return rows.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  }

  async listOutgoingRequests(senderUserId: string, now: Date): Promise<IntroductionRequestRow[]> {
    const rows: IntroductionRequestRow[] = [];
    for (const req of this.introductionRequests.values()) {
      if (req.senderUserId !== senderUserId) continue;
      // Expired rows are dropped; declined rows are included so the SERVICE
      // can mask them as still 'pending' (soft decline — never tell the sender).
      if (req.status === "expired") continue;
      if (req.expiresAt <= now) continue;
      rows.push(this.requestRow(req, req.recipientUserId));
    }
    return rows.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  }

  async respondToRequest(input: {
    requestId: string;
    recipientUserId: string;
    accept: boolean;
    now: Date;
  }): Promise<{ status: string; connectionId: string | null } | null> {
    const req = this.introductionRequests.get(input.requestId);
    if (!req || req.recipientUserId !== input.recipientUserId) return null;
    if (req.status !== "pending" || req.expiresAt <= input.now) return null;

    if (!input.accept) {
      req.status = "declined";
      req.respondedAt = new Date(input.now);
      return { status: "declined", connectionId: null };
    }

    req.status = "accepted";
    req.respondedAt = new Date(input.now);
    const a = req.senderUserId < req.recipientUserId ? req.senderUserId : req.recipientUserId;
    const b = req.senderUserId < req.recipientUserId ? req.recipientUserId : req.senderUserId;
    let conn = [...this.connections.values()].find((c) => c.userAId === a && c.userBId === b);
    if (!conn) {
      conn = {
        id: randomUUID(),
        userAId: a,
        userBId: b,
        status: "request_accepted_pending_confirmation",
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now),
      };
      this.connections.set(conn.id, conn);
    } else {
      conn.status = "request_accepted_pending_confirmation";
      conn.updatedAt = new Date(input.now);
    }
    // Reset any confirmations from a prior attempt.
    for (const key of [`${conn.id}:${a}`, `${conn.id}:${b}`]) {
      this.connectionConfirmations.delete(key);
    }
    return { status: "accepted", connectionId: conn.id };
  }

  async purgeExpiredIntroductionData(
    now: Date,
  ): Promise<{ expiredRequests: number; deletedRequests: number; deletedSwipes: number }> {
    let expiredRequests = 0;
    for (const [id, req] of this.introductionRequests) {
      if ((req.status === "pending" || req.status === "declined") && req.expiresAt <= now) {
        this.introductionRequests.delete(id);
        expiredRequests += 1;
      }
    }
    let deletedRequests = 0;
    let deletedSwipes = 0;
    for (const c of this.connections.values()) {
      if (c.status !== "connected") continue;
      const before = this.introductionRequests.size;
      for (const [id, req] of this.introductionRequests) {
        const pair =
          (req.senderUserId === c.userAId && req.recipientUserId === c.userBId)
          || (req.senderUserId === c.userBId && req.recipientUserId === c.userAId);
        if (pair) this.introductionRequests.delete(id);
      }
      deletedRequests += before - this.introductionRequests.size;
      if (this.decisions.delete(`${c.userAId}:${c.userBId}`)) deletedSwipes += 1;
      if (this.decisions.delete(`${c.userBId}:${c.userAId}`)) deletedSwipes += 1;
    }
    return { expiredRequests, deletedRequests, deletedSwipes };
  }
}

interface MemoryIntroductionRequest {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  respondedAt: Date | null;
}

interface MemoryConnection {
  id: string;
  userAId: string;
  userBId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryIntroductionMessage {
  id: string;
  connectionId: string;
  senderUserId: string;
  body: string;
  hidden: boolean;
  createdAt: Date;
}
