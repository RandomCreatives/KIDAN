import {
  INTENTION_REQUEST_DAILY_CAP,
  INTENTION_REQUEST_TTL_HOURS,
  type IncomingRequestsResponse,
  type IntroductionRequestCreateResponse,
  type IntroductionRequestRespondResponse,
  type IntroductionSummary,
  type OutgoingRequestItem,
  type OutgoingRequestsResponse,
  type ValueTag,
  type DiscoveryProfile,
} from "@kidan/contracts";
import type { IntroductionRequestRow, PersistenceRepository } from "../persistence/types.js";
import type { IdentityCipher } from "../security/crypto.js";

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

export class RequestStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestStateError";
  }
}

/**
 * Intentional introduction requests (Track D2).
 *
 * A right swipe is a private shortlist entry and never notifies anyone. The
 * committed act is a formal introduction request: capped per sender per rolling
 * 24h, expiring unanswered after 72h, and never exposing a decline to the
 * sender. The recipient evaluates a values-only strong-basics summary.
 */
export class RequestService {
  constructor(
    private readonly repository: PersistenceRepository,
    private readonly identityCipher: IdentityCipher,
    private readonly realSubmissionsEnabled: boolean,
    private readonly dailyCap: number = INTENTION_REQUEST_DAILY_CAP,
    private readonly ttlHours: number = INTENTION_REQUEST_TTL_HOURS,
  ) {}

  private ageFrom(ciphertext: Buffer, userId: string, now: Date): number {
    const dob = this.identityCipher.decrypt(ciphertext, `${userId}:date-of-birth`);
    const birth = new Date(`${dob}T00:00:00.000Z`);
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
    return age;
  }

  /** Sends a formal introduction request to a shortlisted target. */
  async sendRequest(
    senderUserId: string,
    input: { targetPublicCode: string; idempotencyKey: string },
    now = new Date(),
  ): Promise<IntroductionRequestCreateResponse> {
    if (!this.realSubmissionsEnabled) throw new RequestStateError("REAL_SUBMISSIONS_DISABLED");

    const targetUserId = await this.repository.findUserIdByPublicCode(input.targetPublicCode);
    if (!targetUserId || targetUserId === senderUserId) {
      throw new RequestStateError("TARGET_NOT_FOUND");
    }

    // A request is the committed step from the private shortlist: the sender
    // must have right-swiped (interested) the target first.
    const shortlisted = await this.repository.hasDiscoveryDecision(senderUserId, targetUserId);
    if (!shortlisted) {
      // Do not reveal whether the target exists; the action is only valid from
      // the shortlist the caller already saw.
      throw new RequestStateError("NOT_SHORTLISTED");
    }

    // Rolling 24h rate limit on created requests.
    const since = new Date(now.getTime() - ROLLING_WINDOW_MS);
    const used = await this.repository.countRequestsSince(senderUserId, since);
    if (used >= this.dailyCap) {
      throw new RequestStateError("INTENTION_RATE_LIMIT");
    }

    const result = await this.repository.createIntroductionRequest({
      senderUserId,
      recipientUserId: targetUserId,
      idempotencyKey: input.idempotencyKey,
      now,
      ttlHours: this.ttlHours,
    });
    if ("duplicate" in result) {
      throw new RequestStateError("REQUEST_ALREADY_EXISTS");
    }

    const remaining = Math.max(0, this.dailyCap - (used + 1));
    return {
      requestId: result.id,
      status: result.status as IntroductionRequestCreateResponse["status"],
      remainingToday: remaining,
      dailyCap: this.dailyCap,
    };
  }

  /** Pending requests addressed to the caller, each with the sender's summary. */
  async listIncoming(userId: string, now = new Date()): Promise<IncomingRequestsResponse> {
    if (!this.realSubmissionsEnabled) return { requests: [] };
    const rows = await this.repository.listIncomingRequests(userId, now);
    const requests: IntroductionSummary[] = [];
    for (const row of rows) {
      const profile = this.toProfile(row, now);
      if (!profile) continue;
      requests.push({
        requestId: row.id,
        profile,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      });
    }
    return { requests };
  }

  /** The caller's sent requests (declines are never returned). */
  async listOutgoing(userId: string, now = new Date()): Promise<OutgoingRequestsResponse> {
    if (!this.realSubmissionsEnabled) {
      return { requests: [], remainingToday: this.dailyCap, dailyCap: this.dailyCap };
    }
    const rows = await this.repository.listOutgoingRequests(userId, now);
    const requests: OutgoingRequestItem[] = [];
    for (const row of rows) {
      const age = this.safeAge(row, now);
      if (age === null) continue;
      requests.push({
        requestId: row.id,
        recipient: {
          publicCode: row.other.publicCode,
          age,
          city: row.other.city,
          gender: row.other.gender as "female" | "male",
        },
        // Soft decline: the sender never learns a decline — it is presented
        // as still 'pending' until accepted or expired.
        status: (row.status === "accepted" ? "accepted" : "pending") as OutgoingRequestItem["status"],
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      });
    }
    const since = new Date(now.getTime() - ROLLING_WINDOW_MS);
    const used = await this.repository.countRequestsSince(userId, since);
    return {
      requests,
      remainingToday: Math.max(0, this.dailyCap - used),
      dailyCap: this.dailyCap,
    };
  }

  /** Recipient accepts or declines a pending request. */
  async respond(
    recipientUserId: string,
    requestId: string,
    accept: boolean,
    now = new Date(),
  ): Promise<IntroductionRequestRespondResponse> {
    if (!this.realSubmissionsEnabled) throw new RequestStateError("REAL_SUBMISSIONS_DISABLED");
    const result = await this.repository.respondToRequest({ requestId, recipientUserId, accept, now });
    if (!result) throw new RequestStateError("REQUEST_NOT_FOUND");
    return {
      requestId,
      connectionId: result.connectionId,
      status: (accept ? "accepted" : "pending") as IntroductionRequestRespondResponse["status"],
    };
  }

  private safeAge(row: IntroductionRequestRow, now: Date): number | null {
    try {
      return this.ageFrom(row.other.dateOfBirthCiphertext, row.other.userId, now);
    } catch {
      return null;
    }
  }

  /** Builds the full values-only discovery profile for a request summary. */
  private toProfile(row: IntroductionRequestRow, now: Date): DiscoveryProfile | null {
    const age = this.safeAge(row, now);
    if (age === null) return null;
    return {
      id: row.other.publicCode,
      publicCode: row.other.publicCode,
      age,
      gender: row.other.gender as "female" | "male",
      city: row.other.city,
      occupationCategory: row.other.occupationCategory,
      educationLevel: row.other.educationLevel,
      heightCm: row.other.heightCm,
      faithTradition: "ethiopian_orthodox_tewahedo",
      marriageIntention: (row.other.marriageIntention ?? "teklil") as DiscoveryProfile["marriageIntention"],
      values: row.other.values as ValueTag[],
      bio: row.other.bio ?? "",
      hasGodfather: row.other.hasGodfather ?? false,
      isDeacon: row.other.isDeacon ?? null,
      churchServiceActive: row.other.churchServiceActive ?? false,
      verified: true,
      photoMode: "values_only",
    };
  }
}
