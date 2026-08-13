import { randomUUID } from "node:crypto";
import type { PersistenceRepository, DraftRecord, IdentityUpdate, SessionRecord, SubmissionConsent, SubmissionRecord, UserRecord } from "./types.js";
import { SubmissionStateError, VersionConflictError } from "./types.js";

export class MemoryPersistenceRepository implements PersistenceRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly telegramUsers = new Map<string, string>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly drafts = new Map<string, DraftRecord>();
  private readonly completeIdentities = new Set<string>();

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

  async updateSessionCsrf(tokenHash: Buffer, csrfTokenHash: Buffer, _now: Date): Promise<void> {
    const session = this.sessions.get(tokenHash.toString("hex"));
    if (session) session.csrfTokenHash = Buffer.from(csrfTokenHash);
  }

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

  async savePrivateIdentity(userId: string, _identity: IdentityUpdate, _now: Date): Promise<void> {
    if (!this.users.has(userId)) throw new Error("USER_NOT_FOUND");
    this.completeIdentities.add(userId);
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
    this.users.get(input.userId)!.status = "profile_pending";
    return { draft: structuredClone(draft), consents: structuredClone(input.consents) };
  }
}
