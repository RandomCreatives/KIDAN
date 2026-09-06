import type {
  AdminDecisionRequest,
  AdminQueueItem,
  AdminReviewDecision,
  AdminSubmissionDetail,
} from "@kidan/contracts";
import { publicOnboardingPayloadSchema } from "@kidan/contracts";
import type { PersistenceRepository } from "../persistence/types.js";
import { IdentityCipher } from "../security/crypto.js";

/** Fixed pilot super-admin id (seeded in migration 0005). */
export const PILOT_ADMIN_ID = "00000000-0000-4000-8000-0000000000a0";

export class AdminDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminDecisionError";
  }
}

/**
 * Admin console orchestration. All identity/photo decryption is funnelled
 * through this service and is reachable only after admin authentication at the
 * route layer. Nothing here is ever exposed to candidate sessions or discovery.
 */
export class AdminService {
  constructor(
    private readonly repository: PersistenceRepository,
    private readonly identityCipher: IdentityCipher,
    private readonly adminId: string = PILOT_ADMIN_ID,
  ) {}

  async listQueue(now = new Date()): Promise<AdminQueueItem[]> {
    const rows = await this.repository.listPendingSubmissions();
    const items: AdminQueueItem[] = [];
    for (const row of rows) {
      let age: number;
      try {
        const dob = this.decryptDateOfBirth(row.userId, row.dateOfBirthCiphertext);
        age = this.computeAge(dob, now);
      } catch {
        // Age is a convenience column; a decrypt failure must not hide the
        // candidate from review (the detail view will surface the error).
        age = 0;
      }
      const payload = (await this.repository.getDraft(row.userId))?.publicPayload as
        | { publicProfile?: { gender?: string; city?: string } }
        | undefined;
      items.push({
        publicCode: row.publicCode,
        gender: (payload?.publicProfile?.gender === "male" ? "male" : "female") as "male" | "female",
        city: payload?.publicProfile?.city ?? row.city,
        age,
        submittedAt: new Date(row.submittedAt).toISOString(),
        reviewStatus: "pending",
        hasPhoto: row.hasPhoto,
      });
    }
    return items;
  }

  async getSubmission(publicCode: string): Promise<AdminSubmissionDetail | null> {
    const userId = await this.repository.findUserIdByPublicCode(publicCode);
    if (!userId) return null;
    const row = await this.repository.getSubmissionForAdmin(userId);
    if (!row) return null;

    if (!row.legalNameCiphertext || !row.phoneCiphertext || !row.dateOfBirthCiphertext) {
      throw new AdminDecisionError("IDENTITY_UNAVAILABLE");
    }
    const fullName = this.identityCipher.decrypt(row.legalNameCiphertext, `${userId}:legal-name`);
    const phoneNumber = this.identityCipher.decrypt(row.phoneCiphertext, `${userId}:phone`);
    const dateOfBirth = this.identityCipher.decrypt(row.dateOfBirthCiphertext, `${userId}:date-of-birth`);
    const publicPayload = publicOnboardingPayloadSchema.parse(row.publicPayload);

    const history = row.history.map((h) => ({
      decision: h.decision as AdminReviewDecision,
      reasonCode: h.reasonCode,
      note: h.noteCiphertext
        ? this.identityCipher.decrypt(h.noteCiphertext, `${userId}:review-note`)
        : null,
      decidedAt: new Date(h.decidedAt).toISOString(),
    }));

    return {
      publicCode: row.publicCode,
      status: row.status === "profile_pending" || row.status === "active" || row.status === "paused" || row.status === "suspended"
        ? row.status
        : "profile_pending",
      submittedAt: new Date(row.submittedAt).toISOString(),
      publicPayload,
      identity: { fullName, phoneNumber, dateOfBirth },
      hasPhoto: row.hasPhoto,
      reviewStatus: (["pending", "approved", "rejected", "changes_requested"].includes(row.reviewStatus)
        ? row.reviewStatus
        : "pending") as AdminSubmissionDetail["reviewStatus"],
      history,
    };
  }

  async getPhoto(publicCode: string): Promise<{ mediaType: string; bytes: Buffer } | null> {
    const userId = await this.repository.findUserIdByPublicCode(publicCode);
    if (!userId) return null;
    // Reuse the onboarding service's admin decrypt path semantics via the repo.
    const record = await this.repository.getVerificationPhoto(userId);
    if (!record || record.deletedAt) return null;
    const bytes = this.identityCipher.decryptBuffer(record.photoCiphertext, `${userId}:verification-photo`);
    return { mediaType: record.mediaType, bytes };
  }

  async decide(publicCode: string, request: AdminDecisionRequest, now = new Date()): Promise<AdminReviewDecision> {
    const userId = await this.repository.findUserIdByPublicCode(publicCode);
    if (!userId) throw new AdminDecisionError("SUBMISSION_NOT_FOUND");
    const submission = await this.repository.getSubmissionForAdmin(userId);
    if (!submission) throw new AdminDecisionError("SUBMISSION_NOT_FOUND");
    // Decisions are made on profiles currently in the review queue. An
    // already-approved/rejected profile is not re-decidable from the console.
    if (submission.reviewStatus !== "pending" && submission.reviewStatus !== "changes_requested") {
      throw new AdminDecisionError("SUBMISSION_NOT_PENDING");
    }

    const note = request.note && request.note.trim().length > 0 ? request.note.trim() : null;
    if (request.decision !== "approved" && !note) {
      // Rejections and change requests must carry feedback for the candidate.
      throw new AdminDecisionError("FEEDBACK_REQUIRED");
    }
    const noteCiphertext = note
      ? this.identityCipher.encrypt(note, `${userId}:review-note`)
      : null;

    await this.repository.recordAdminDecision({
      userId,
      adminId: this.adminId,
      decision: request.decision,
      reasonCode: request.reasonCode && request.reasonCode.trim() ? request.reasonCode.trim() : null,
      noteCiphertext,
      now,
    });
    return request.decision;
  }

  private decryptDateOfBirth(userId: string, ciphertext: Buffer): string {
    return this.identityCipher.decrypt(ciphertext, `${userId}:date-of-birth`);
  }

  private computeAge(dateOfBirthIso: string, now: Date): number {
    const birth = new Date(`${dateOfBirthIso}T00:00:00.000Z`);
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
    return age;
  }
}
