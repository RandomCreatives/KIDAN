/**
 * Feedback / comments / concerns from candidates to the operator.
 *
 * Pure, PII-typed service backed by the persistence repository. It stores the
 * user's own words so the operator can triage support issues and feedback.
 * Free-text length is bounded here (defence in depth alongside the DB CHECK),
 * and no feedback body is ever logged. The public code is attached so the
 * operator console can label entries without decrypting identity.
 */

import type { PersistenceRepository, FeedbackRow } from "../persistence/types.js";
import type { FeedbackKind } from "@kidan/contracts";
import type { AdminNotifier } from "../notifications/adminNotifier.js";

export interface FeedbackSummary {
  items: FeedbackRow[];
  unreadCount: number;
}

export class FeedbackService {
  constructor(
    private readonly repository: PersistenceRepository,
    private readonly notifier?: AdminNotifier,
  ) {}

  /** Persist a candidate's feedback. Returns the new entry id/creation time. */
  async submit(input: {
    userId: string;
    publicCode: string;
    kind: FeedbackKind;
    body: string;
    now?: Date;
  }): Promise<{ id: string; createdAt: Date }> {
    const body = input.body.trim();
    if (body.length < 1) throw new FeedbackError("EMPTY_FEEDBACK");
    if (body.length > 4000) throw new FeedbackError("FEEDBACK_TOO_LONG");
    const created = await this.repository.createFeedback({
      userId: input.userId,
      publicCode: input.publicCode,
      kind: input.kind,
      body,
      now: input.now ?? new Date(),
    });
    // Nudge the operator for actionable reports. Privacy-safe: public code
    // only, never identity. Fire-and-forget so feedback is never lost if the
    // notifier is down.
    if (input.kind === "report" && this.notifier) {
      await this.notifier
        .notify({
          kind: "new_feedback",
          message: `New concern from ${input.publicCode}: ${body.slice(0, 140)}`,
        })
        .catch(() => undefined);
    }
    return created;
  }

  /** All feedback newest-first, with the unread count. */
  async list(): Promise<FeedbackSummary> {
    return this.repository.listFeedback();
  }

  /** Mark a single feedback entry read. */
  async markRead(id: string, now?: Date): Promise<boolean> {
    return this.repository.markFeedbackRead(id, now ?? new Date());
  }

  /** The caller's public code (KD-XXXXXX), or null when the user is unknown. */
  async publicCodeFor(userId: string): Promise<string | null> {
    return this.repository.getPublicCode(userId);
  }
}

export class FeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackError";
  }
}
