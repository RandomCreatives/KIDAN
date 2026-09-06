import { discoveryProfileSchema, type DiscoveryFeedResponse, type DiscoveryProfile, type ValueTag } from "@kidan/contracts";
import type { PersistenceRepository } from "../persistence/types.js";
import { IdentityCipher } from "../security/crypto.js";

const PAGE_SIZE = 10;

export class DiscoveryStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryStateError";
  }
}

/**
 * Values-only discovery (Track C).
 *
 * Serves approved profiles as values-only cards — never a name, phone, photo,
 * or Telegram identity. Discovery decisions (pass/interested) are recorded
 * privately and never disclosed one-sidedly.
 */
export class DiscoveryService {
  constructor(
    private readonly repository: PersistenceRepository,
    private readonly identityCipher: IdentityCipher,
    private readonly realSubmissionsEnabled: boolean,
  ) {}

  /**
   * Returns a page of values-only discovery cards for the given actor. Only
   * active, admin-approved candidates of the actor's preferred gender that the
   * actor has not yet decided on are included.
   */
  async getFeed(actorUserId: string, now = new Date()): Promise<DiscoveryFeedResponse> {
    if (!this.realSubmissionsEnabled) {
      return { cards: [], hasMore: false };
    }
    const rows = await this.repository.listDiscoveryCandidates({
      actorUserId,
      limit: PAGE_SIZE + 1,
      offset: 0,
    });
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const cards: DiscoveryProfile[] = [];
    for (const row of page) {
      if (row.values.length === 0 || !row.bio) continue;
      let age: number;
      try {
        const dob = this.identityCipher.decrypt(row.dateOfBirthCiphertext, `${row.userId}:date-of-birth`);
        age = computeAge(dob, now);
      } catch {
        continue;
      }
      const card = discoveryProfileSchema.safeParse({
        id: row.publicCode,
        publicCode: row.publicCode,
        age,
        gender: row.gender,
        city: row.city,
        occupationCategory: row.occupationCategory,
        educationLevel: row.educationLevel,
        heightCm: row.heightCm,
        faithTradition: "ethiopian_orthodox_tewahedo",
        marriageIntention: row.marriageIntention ?? "teklil",
        values: row.values as ValueTag[],
        bio: row.bio,
        verified: true,
        photoMode: "values_only",
      });
      if (card.success) cards.push(card.data);
    }
    return { cards, hasMore };
  }

  /** Records a pass/interested decision. Idempotent per actor+target. */
  async recordDecision(
    actorUserId: string,
    request: { targetPublicCode: string; decision: "pass" | "interested"; idempotencyKey: string },
    now = new Date(),
  ): Promise<void> {
    if (!this.realSubmissionsEnabled) throw new DiscoveryStateError("REAL_SUBMISSIONS_DISABLED");
    const targetUserId = await this.repository.findUserIdByPublicCode(request.targetPublicCode);
    if (!targetUserId || targetUserId === actorUserId) {
      throw new DiscoveryStateError("TARGET_NOT_FOUND");
    }
    // recordDecisionAndMaybeConnect is idempotent per actor+target; when the
    // decision completes a mutual interest it creates the pending connection.
    await this.repository.recordDecisionAndMaybeConnect({
      actorUserId,
      targetUserId,
      decision: request.decision,
      idempotencyKey: request.idempotencyKey,
      now,
    });
  }
}

function computeAge(dateOfBirthIso: string, now: Date): number {
  const birth = new Date(`${dateOfBirthIso}T00:00:00.000Z`);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}
