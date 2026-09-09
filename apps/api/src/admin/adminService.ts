import type {
  AdminDecisionRequest,
  AdminQueueItem,
  AdminReviewDecision,
  AdminSubmissionDetail,
  FunnelMetrics,
} from "@kidan/contracts";
import { publicOnboardingPayloadSchema } from "@kidan/contracts";
import type { PersistenceRepository } from "../persistence/types.js";
import { IdentityCipher } from "../security/crypto.js";
import type { CandidateNotificationKind, CandidateNotifier } from "../notifications/candidateNotifier.js";
import { NoopCandidateNotifier } from "../notifications/telegramNotifier.js";
import { Jimp } from "jimp";

/** Largest edge of the retained post-approval verification thumbnail (Option A). */
const VERIFICATION_THUMBNAIL_MAX_EDGE = 240;
const VERIFICATION_THUMBNAIL_MEDIA_TYPE = "image/jpeg";

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
  private readonly notifier: CandidateNotifier;

  constructor(
    private readonly repository: PersistenceRepository,
    private readonly identityCipher: IdentityCipher,
    notifier?: CandidateNotifier,
    private readonly adminId: string = PILOT_ADMIN_ID,
  ) {
    this.notifier = notifier ?? new NoopCandidateNotifier();
  }

  /** Privacy-safe pilot funnel metrics (Track E2) — counts only, no identities. */
  async getFunnelMetrics(): Promise<FunnelMetrics> {
    const counts = await this.repository.getFunnelCounts();
    return {
      cohort: {
        submitted: counts.submitted,
        approved: counts.approved,
      },
      discovery: { shortlisted: counts.shortlisted },
      requests: {
        pending: counts.requestsPending,
        accepted: counts.requestsAccepted,
        declined: counts.requestsDeclined,
        expired: counts.requestsExpired,
      },
      connections: {
        pendingAdmin: counts.connectionsPendingAdmin,
        connected: counts.connectionsConnected,
        declined: counts.connectionsDeclined,
        rejected: counts.connectionsRejected,
      },
    };
  }

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

  /** Roster of ALL submitted candidates (regardless of decision) for the funnel list. */
  async listAll(now = new Date()): Promise<AdminQueueItem[]> {
    const rows = await this.repository.listAllSubmissions();
    const items: AdminQueueItem[] = [];
    for (const row of rows) {
      let age: number;
      try {
        const dob = this.decryptDateOfBirth(row.userId, row.dateOfBirthCiphertext);
        age = this.computeAge(dob, now);
      } catch {
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
        reviewStatus: (["pending", "approved", "rejected", "changes_requested"].includes(row.reviewStatus)
          ? row.reviewStatus
          : "pending") as AdminQueueItem["reviewStatus"],
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

  /**
   * Option A retention: replace the stored full-resolution verification photo
   * with a small downscaled JPEG thumbnail (PII-reduction, not discovery). The
   * thumbnail retains enough evidence for a brief dispute window but a fraction
   * of the storage and far less identifying detail. Best-effort and PII-safe.
   */
  private async degradeVerificationPhotoToThumbnail(userId: string): Promise<void> {
    try {
      const record = await this.repository.getVerificationPhoto(userId);
      if (!record || record.deletedAt !== null || record.photoCiphertext.length === 0) return;
      const bytes = this.identityCipher.decryptBuffer(record.photoCiphertext, `${userId}:verification-photo`);
      const image = await Jimp.fromBuffer(bytes);
      const { width, height } = image.bitmap;
      const maxDim = Math.max(width, height);
      const scale = maxDim > VERIFICATION_THUMBNAIL_MAX_EDGE ? VERIFICATION_THUMBNAIL_MAX_EDGE / maxDim : 1;
      const outWidth = Math.max(1, Math.round(width * scale));
      const outHeight = Math.max(1, Math.round(height * scale));
      const thumb = image.clone().resize({ w: outWidth, h: outHeight });
      const thumbBytes = await thumb.getBuffer(VERIFICATION_THUMBNAIL_MEDIA_TYPE);
      const thumbCiphertext = this.identityCipher.encryptBuffer(thumbBytes, `${userId}:verification-photo`);
      await this.repository.replaceVerificationPhoto(userId, {
        photoCiphertext: thumbCiphertext,
        mediaType: VERIFICATION_THUMBNAIL_MEDIA_TYPE,
      });
    } catch {
      // Swallow: approval is authoritative; retention purges the ciphertext on
      // schedule regardless of whether the thumbnail could be produced.
    }
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

    // Option A of the retention policy: once approved, the full-resolution
    // identity photo is no longer needed. Swap the stored ciphertext for a small
    // thumbnail (kept ~14 days for the dispute window) instead of the full image.
    // Best-effort — a failure must never block the approval, in which case the
    // retention cron still purges the (full-size) ciphertext on schedule.
    if (request.decision === "approved") {
      await this.degradeVerificationPhotoToThumbnail(userId);
    }

    // Privacy-safe Telegram notification (never blocks the decision).
    await this.notifyCandidate(userId, request.decision);

    return request.decision;
  }

  private async notifyCandidate(userId: string, decision: AdminReviewDecision): Promise<void> {
    const kind: CandidateNotificationKind =
      decision === "approved"
        ? "profile_approved"
        : decision === "rejected"
          ? "profile_rejected"
          : "profile_changes_requested";
    const ciphertext = await this.repository.getCandidateTelegramIdCiphertext(userId);
    if (!ciphertext) return;
    let telegramId: bigint;
    try {
      telegramId = BigInt(this.identityCipher.decrypt(ciphertext, "telegram-id"));
    } catch {
      return;
    }
    await this.notifier.notifyReviewDecision(telegramId, kind);
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
