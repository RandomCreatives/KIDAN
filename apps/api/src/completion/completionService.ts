import type { IdentityCipher } from "../security/crypto.js";
import type {
  PairingJourneyRow,
  PairingPulseAnswer,
  PairingPulseKind,
  PersistenceRepository,
} from "../persistence/types.js";

/**
 * Kidan Completion — the post-match journey (docs/KIDAN_COMPLETION.md).
 *
 * States: chatting -> revealed -> completed_together | decoupled (any stage).
 * Owner decisions (2026-09-11):
 *   - Reveal payload = full legal name + registration phone, simultaneous.
 *   - Gate = 7 days AND 20 combined exchanged messages (BOTH required).
 *   - "Are you ready?" is a repeating loop; both "not yet" = chat continues.
 *   - Serial-dater defense = reminder, THEN hard block on new picks.
 *   - Closing is clean + a follow-up popup ~3 days later, pulses via bot.
 *
 * This service owns pure state transitions + produces dispatch intents
 * (pulses/handshake prompts) for the scheduler; bot/miniapp wiring is Phase 2/3.
 */

export const COMPLETION_CONFIG = {
  gateDays: 7,
  gateMessages: 20,
  firstPulseDelayDays: 3,
  pulseIntervalDays: 7,
  readyReaskDays: 7,
  oneSidedReadyExpiryDays: 7,
  staleDays: 7,
  stallRemindGraceDays: 3,
  stallBlockAfterRemindDays: 7,
  closingFollowupDelayDays: 3,
  zombieNotYetCycles: 3,
} as const;

const DAY = 24 * 60 * 60 * 1000;
export const daysLater = (from: Date, n: number) => new Date(from.getTime() + n * DAY);

export class CompletionStateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CompletionStateError";
  }
}

/** Side label inside a journey row. */
type Side = "a" | "b";

export interface RevealResult {
  connectionId: string;
  /** The OTHER participant's unveiled identity for the caller. */
  counterpart: { publicCode: string; legalName: string; phone: string };
}

export interface JourneyView {
  connectionId: string;
  stage: PairingJourneyRow["stage"];
  counterpartCode: string;
  gate: { gateMet: boolean; daysRemaining: number; messagesRemaining: number };
  readiness: {
    selfReady: boolean;
    otherReady: boolean;
    primerStage: "none" | "awaiting_self" | "awaiting_other";
    notYetCycles: number;
    zombieReflectionDue: boolean;
  };
  stalled: boolean;
  blocked: boolean;
}

/** Side-effects the scheduler/transport layer performs (no bot imports here). */
export interface TickDispatch {
  type: "pulse" | "stall_reminder" | "stall_block";
  connectionId: string;
  userId: string;
  kind: PairingPulseKind;
}

export class CompletionService {
  constructor(
    private readonly repo: PersistenceRepository,
    private readonly identityCipher: IdentityCipher,
  ) {}

  // ---------------------------------------------------------------- lifecycle

  /** Called when a connection first reaches 'connected' (both sides confirmed).
   *  Idempotent: an existing journey is returned unchanged. */
  async onConnected(input: { connectionId: string; now: Date }): Promise<PairingJourneyRow> {
    const existing = await this.repo.getPairingJourney(input.connectionId);
    if (existing) return existing;
    const summary = await this.repo.getConnectionSummary(input.connectionId);
    if (!summary) throw new CompletionStateError("CONNECTION_NOT_FOUND", "Connection summary missing.");
    const journey = await this.repo.createPairingJourney({
      connectionId: input.connectionId,
      userAId: summary.userAId,
      userBId: summary.userBId,
      matchedAt: input.now,
    });
    await this.event(input.connectionId, "matched", null);
    return journey;
  }

  /** Called for every accepted introduction message in the thread. */
  async onMessage(input: { connectionId: string; senderUserId: string; now: Date }): Promise<void> {
    const journey = await this.requireJourney(input.connectionId);
    if (journey.stage === "decoupled" || journey.stage === "completed_together") return;
    const side = this.sideOf(journey, input.senderUserId);
    const journeyAgeOk = input.now.getTime() - journey.matchedAt.getTime() >= COMPLETION_CONFIG.gateDays * DAY;
    const nextCount = journey.exchangeCount + 1;
    const gateNowMet = journeyAgeOk && nextCount >= COMPLETION_CONFIG.gateMessages;
    await this.repo.updatePairingJourney(input.connectionId, {
      exchangeCount: nextCount,
      lastMessageAt: input.now,
      ...(side === "a" ? { lastActiveAtA: input.now } : { lastActiveAtB: input.now }),
      ...(gateNowMet && !journey.revealGateUnlockedAt ? { revealGateUnlockedAt: input.now } : {}),
      ...this.revivePatch(journey, side, input.now),
    });
    if (gateNowMet && !journey.revealGateUnlockedAt) {
      await this.event(input.connectionId, "gate_unlocked", null, { exchangeCount: nextCount });
    }
    if (this.sideWasStale(journey, side, input.now) && (journey.stallRemindDueAt ?? journey.stallBlockedAt)) {
      await this.event(input.connectionId, "revived", input.senderUserId, { via: "message" });
    }
  }

  /** Owner rule: "activity revives". When a side that had gone silent (last
   *  activity older than staleDays) acts again, any stall reminder/block on
   *  the journey clears. If the OTHER side is still quiet, the next tick
   *  starts a fresh reminder cycle for them. */
  private revivePatch(
    journey: PairingJourneyRow,
    side: Side,
    now: Date,
  ): { stallRemindDueAt?: null; stallBlockedAt?: null } {
    if (!journey.stallRemindDueAt && !journey.stallBlockedAt) return {};
    if (!this.sideWasStale(journey, side, now)) return {};
    return { stallRemindDueAt: null, stallBlockedAt: null };
  }

  private sideWasStale(journey: PairingJourneyRow, side: Side, now: Date): boolean {
    const lastActive = side === "a" ? journey.lastActiveAtA : journey.lastActiveAtB;
    return now.getTime() - lastActive.getTime() >= COMPLETION_CONFIG.staleDays * DAY;
  }

  // ------------------------------------------------------------- reveal loop

  /**
   * One side answers "Are you ready?" (loop answers; may be re-asked weekly).
   * Both-yes moves the pair into the primer stage (simultaneous confirm).
   */
  async answerReadiness(
    connectionId: string,
    userId: string,
    answer: "ready" | "not_yet",
    now: Date,
  ): Promise<{ state: "both_ready" | "one_sided" | "continue_chatting" | "zombie_reflection" }> {
    const journey = await this.requireJourney(connectionId);
    this.sideOf(journey, userId);
    if (journey.stage !== "chatting") throw new CompletionStateError("NOT_IN_READY_STAGE", "Reveal loop is not open.");
    if (!journey.revealGateUnlockedAt) throw new CompletionStateError("GATE_NOT_MET", "The next step unlocks with time and conversation.");
    if (journey.stallBlockedAt) throw new CompletionStateError("STALLED", "This path needs attention first.");

    if (answer === "ready") {
      await this.event(connectionId, "ready_yes", userId);
      if (journey.revealReadyUserId && journey.revealReadyUserId !== userId) {
        // both ready -> primer stage begins; ask both to confirm simultaneously
        await this.repo.updatePairingJourney(connectionId, {
          revealReadyUserId: userId, // last to press; both flagged via revealReadyAt
          revealReadyAt: journey.revealReadyAt ?? now,
        });
        await this.event(connectionId, "both_ready", null);
        return { state: "both_ready" };
      }
      await this.repo.updatePairingJourney(connectionId, {
        revealReadyUserId: userId,
        revealReadyAt: now,
      });
      return { state: "one_sided" };
    }

    // answer === "not_yet": warm continuation, never a penalty
    await this.event(connectionId, "ready_not_yet", userId);
    // If the OTHER side had a pending one-sided yes, that proposal resolves.
    const clearedPending = journey.revealReadyUserId && journey.revealReadyUserId !== userId;
    const nextCycles = clearedPending ? journey.notYetCycleCount + 1 : journey.notYetCycleCount;
    await this.repo.updatePairingJourney(connectionId, {
      revealReadyUserId: null,
      revealReadyAt: null,
      notYetCycleCount: nextCycles,
      lastReadyPromptAt: now,
    });
    if (nextCycles >= COMPLETION_CONFIG.zombieNotYetCycles) {
      return { state: "zombie_reflection" };
    }
    return { state: "continue_chatting" };
  }

  /**
   * Primer confirmation — the simultaneous confirm AFTER both said ready.
   * The second confirmer triggers the atomic reveal.
   */
  async confirmReveal(connectionId: string, userId: string, now: Date): Promise<{ revealed: boolean; counterpart?: RevealResult["counterpart"] }> {
    const journey = await this.requireJourney(connectionId);
    const side = this.sideOf(journey, userId);
    if (journey.stage !== "chatting" || !journey.revealReadyUserId || !journey.revealReadyAt) {
      throw new CompletionStateError("NOT_IN_PRIMER", "Both must be ready before the unveil.");
    }
    const patch: Record<string, unknown> = side === "a" ? { primerConfirmedA: true } : { primerConfirmedB: true };
    await this.repo.updatePairingJourney(connectionId, patch as never);
    const fresh = (await this.requireJourney(connectionId)) as PairingJourneyRow;
    const bothConfirmed = fresh.primerConfirmedA && fresh.primerConfirmedB;
    if (!bothConfirmed) return { revealed: false };

    await this.repo.updatePairingJourney(connectionId, {
      stage: "revealed",
      revealedAt: now,
      lastReadyPromptAt: now,
    });
    await this.event(connectionId, "revealed", null);
    const counterpart = await this.revealCounterpartFor(fresh, userId);
    return { revealed: true, counterpart };
  }

  /** Post-reveal: the OTHER side can also read the unveiled identity (on demand). */
  async getRevealedCounterpart(connectionId: string, userId: string): Promise<RevealResult["counterpart"]> {
    const journey = await this.requireJourney(connectionId);
    this.sideOf(journey, userId);
    if (journey.stage !== "revealed" && journey.stage !== "completed_together") {
      throw new CompletionStateError("NOT_REVEALED", "Identities unveil together when both are ready.");
    }
    return this.revealCounterpartFor(journey, userId);
  }

  // ------------------------------------------------------------------ closing

  /** Clean, dignified close available at any stage (owner decision #5). */
  async requestClose(
    connectionId: string,
    userId: string,
    now: Date,
    reason?: string,
  ): Promise<{ followupDueAt: Date }> {
    const journey = await this.requireJourney(connectionId);
    this.sideOf(journey, userId);
    if (journey.stage === "decoupled") throw new CompletionStateError("ALREADY_CLOSED", "This path is already closed.");
    const followupDueAt = daysLater(now, COMPLETION_CONFIG.closingFollowupDelayDays);
    await this.repo.updatePairingJourney(connectionId, {
      stage: "decoupled",
      decoupledAt: now,
      decoupledByUserId: userId,
      decoupleReason: reason?.slice(0, 60) ?? null,
      closingFollowupDueAt: followupDueAt,
    });
    await this.repo.closeConnection(connectionId, now);
    await this.event(connectionId, "decoupled", userId, { reason: reason ?? null });
    return { followupDueAt };
  }

  /** Together-report (couple walks forward with intent; v1 self-report). */
  async reportTogether(connectionId: string, userId: string, now: Date): Promise<void> {
    const journey = await this.requireJourney(connectionId);
    this.sideOf(journey, userId);
    if (journey.stage !== "revealed") throw new CompletionStateError("NOT_REVEALED", "Path must be revealed first.");
    await this.repo.updatePairingJourney(connectionId, { stage: "completed_together" });
    await this.event(connectionId, "completed_together", userId);
  }

  /** Serial-dater gate: new picks blocked while an un-closed silent pairing exists. */
  async isNewPickBlocked(userId: string): Promise<boolean> {
    return this.repo.hasBlockingStall(userId);
  }

  // ---------------------------------------------------------------- scheduler

  /**
   * Computes everything due right now: readiness re-asks, cadence pulses,
   * closing follow-ups, stall probes/reminders/blocks. The transport layer
   * turns dispatches into bot messages. Pure against `now` — test-friendly.
   */
  async tick(now: Date): Promise<TickDispatch[]> {
    const dispatches: TickDispatch[] = [];
    const active = await this.repo.listActivePairingJourneys(500);
    for (const journey of active) {
      if (journey.stage === "chatting") {
        dispatches.push(...(await this.tickChatting(journey, now)));
      } else if (journey.stage === "revealed") {
        dispatches.push(...(await this.tickPulseCadence(journey, now, "check_in")));
      }
    }
    // Independent of stage: the +3d closing follow-up fires exactly once per
    // decoupled journey. The repository claim clears closingFollowupDueAt
    // atomically, so concurrent/daily ticks can never double-send.
    const dueFollowups = await this.repo.claimDueClosingFollowups(now, 200);
    for (const journey of dueFollowups) {
      for (const uid of [journey.userAId, journey.userBId]) {
        await this.repo.insertPairingPulse({ connectionId: journey.connectionId, userId: uid, kind: "closing_followup", dueAt: now });
        dispatches.push({ type: "pulse", connectionId: journey.connectionId, userId: uid, kind: "closing_followup" });
      }
      await this.event(journey.connectionId, "closing_followup_due", null);
    }
    return dispatches;
  }

  private async tickChatting(journey: PairingJourneyRow, now: Date): Promise<TickDispatch[]> {
    const dispatches: TickDispatch[] = [];
    // 0) gate: 7 days + 20 exchanges may be reached between messages — the cron
    // tick must unlock it too, or a couple who chatted heavily early would wait
    // forever for their next message to trip the gate inside onMessage.
    if (
      !journey.revealGateUnlockedAt &&
      now.getTime() - journey.matchedAt.getTime() >= COMPLETION_CONFIG.gateDays * DAY &&
      journey.exchangeCount >= COMPLETION_CONFIG.gateMessages
    ) {
      await this.repo.updatePairingJourney(journey.connectionId, { revealGateUnlockedAt: now });
      await this.event(journey.connectionId, "gate_unlocked", null, { exchangeCount: journey.exchangeCount });
      journey = { ...journey, revealGateUnlockedAt: now };
    }
    // 1) readiness loop re-ask (gate met, ~weekly cadence, expire one-sided yes)
    if (journey.revealGateUnlockedAt) {
      const oneSidedExpired =
        journey.revealReadyUserId && journey.revealReadyAt &&
        now.getTime() - journey.revealReadyAt.getTime() >= COMPLETION_CONFIG.oneSidedReadyExpiryDays * DAY;
      if (oneSidedExpired) {
        // expired one-sided proposal: clear it; the loop re-asks BOTH below
        await this.repo.updatePairingJourney(journey.connectionId, {
          revealReadyUserId: null,
          revealReadyAt: null,
        });
      }
      const reaskDue =
        !journey.revealReadyUserId &&
        (!journey.lastReadyPromptAt
          ? now.getTime() >= journey.revealGateUnlockedAt.getTime()
          : now.getTime() - journey.lastReadyPromptAt.getTime() >= COMPLETION_CONFIG.readyReaskDays * DAY);
      if (reaskDue) {
        await this.repo.updatePairingJourney(journey.connectionId, { lastReadyPromptAt: now });
        for (const uid of [journey.userAId, journey.userBId]) {
          await this.repo.insertPairingPulse({ connectionId: journey.connectionId, userId: uid, kind: "readiness", dueAt: now });
          dispatches.push({ type: "pulse", connectionId: journey.connectionId, userId: uid, kind: "readiness" });
        }
        void this.repo.insertPairingEvent({
          connectionId: journey.connectionId,
          kind: "ready_prompt_due",
          actorUserId: null,
        });
      }
    }
    // 2) silent-side stall machinery: reminder then hard block
    dispatches.push(...(await this.tickStall(journey, now)));
    // 3) ordinary cadence pulses (day 3, then weekly)
    dispatches.push(...(await this.tickPulseCadence(journey, now, "check_in")));
    return dispatches;
  }

  private async tickStall(journey: PairingJourneyRow, now: Date): Promise<TickDispatch[]> {
    const dispatches: TickDispatch[] = [];
    const staleA = now.getTime() - journey.lastActiveAtA.getTime() >= COMPLETION_CONFIG.staleDays * DAY;
    const staleB = now.getTime() - journey.lastActiveAtB.getTime() >= COMPLETION_CONFIG.staleDays * DAY;
    if (!staleA && !staleB) return dispatches;

    if (!journey.stallRemindDueAt) {
      // first stale detection -> gentle reminder to the silent side(s)
      await this.repo.updatePairingJourney(journey.connectionId, {
        stallRemindDueAt: now,
      });
      await this.event(journey.connectionId, "stalled", null, { sides: [staleA ? "a" : null, staleB ? "b" : null].filter(Boolean) });
      for (const uid of [...(staleA ? [journey.userAId] : []), ...(staleB ? [journey.userBId] : [])]) {
        await this.repo.insertPairingPulse({ connectionId: journey.connectionId, userId: uid, kind: "stall_probe", dueAt: now, context: { role: "silent_reminder" } });
        dispatches.push({ type: "stall_reminder", connectionId: journey.connectionId, userId: uid, kind: "stall_probe" });
      }
      return dispatches;
    }
    // reminder grace exhausted -> hard block on new picks until closed
    if (
      !journey.stallBlockedAt &&
      now.getTime() - journey.stallRemindDueAt.getTime() >= COMPLETION_CONFIG.stallBlockAfterRemindDays * DAY
    ) {
      await this.repo.updatePairingJourney(journey.connectionId, { stallBlockedAt: now });
      await this.event(journey.connectionId, "stall_blocked", null);
      // the non-silent side gets "still waiting?" probe
      const waitingSide = staleA && !staleB ? journey.userBId : staleB && !staleA ? journey.userAId : null;
      if (waitingSide) {
        await this.repo.insertPairingPulse({ connectionId: journey.connectionId, userId: waitingSide, kind: "stall_probe", dueAt: now, context: { role: "still_waiting_probe" } });
        dispatches.push({ type: "stall_block", connectionId: journey.connectionId, userId: waitingSide, kind: "stall_probe" });
      }
    }
    return dispatches;
  }

  private async tickPulseCadence(journey: PairingJourneyRow, now: Date, kind: PairingPulseKind): Promise<TickDispatch[]> {
    const dispatches: TickDispatch[] = [];
    // cadence: first pulse day +3 after match, then every 7 days per side
    for (const uid of [journey.userAId, journey.userBId]) {
      const history = await this.repo.listPairingPulses({ connectionId: journey.connectionId, userId: uid, limit: 10 });
      const latestOfKind = history.find((p) => p.kind === kind);
      const anchor = latestOfKind ? daysLater(latestOfKind.createdAt, COMPLETION_CONFIG.pulseIntervalDays) : daysLater(journey.matchedAt, COMPLETION_CONFIG.firstPulseDelayDays);
      if (now.getTime() < anchor.getTime()) continue;
      if (latestOfKind && latestOfKind.answeredAt === null && latestOfKind.createdAt.getTime() <= now.getTime()) {
        // an unanswered pulse of this kind is still open -> do not stack another
        continue;
      }
      await this.repo.insertPairingPulse({ connectionId: journey.connectionId, userId: uid, kind, dueAt: now });
      dispatches.push({ type: "pulse", connectionId: journey.connectionId, userId: uid, kind });
    }
    return dispatches;
  }

  /** Answers arriving from inline buttons / popups. */
  async answerPulse(
    pulseId: string,
    userId: string,
    answer: PairingPulseAnswer,
    now: Date,
  ): Promise<{ applied: "recorded" | "routing_close" | "routing_guidance" | "readiness" }> {
    const pulse = await this.repo.answerPairingPulse(pulseId, answer, now);
    if (!pulse || pulse.userId !== userId) throw new CompletionStateError("PULSE_NOT_RESPONDABLE", "Unknown or already answered check-in.");
    const journey = await this.requireJourney(pulse.connectionId);
    const side = this.sideOf(journey, userId);
    await this.repo.updatePairingJourney(pulse.connectionId, {
      ...(side === "a" ? { lastActiveAtA: now } : { lastActiveAtB: now }),
      ...this.revivePatch(journey, side, now),
    });
    await this.event(pulse.connectionId, "pulse_answered", userId, { kind: pulse.kind, answer });

    if (this.sideWasStale(journey, side, now) && (journey.stallRemindDueAt ?? journey.stallBlockedAt)) {
      await this.event(pulse.connectionId, "revived", userId, { via: "pulse" });
    }

    if (pulse.kind === "readiness" && (answer === "ready" || answer === "not_yet")) {
      await this.answerReadiness(pulse.connectionId, userId, answer, now);
      return { applied: "readiness" };
    }
    if (answer === "part" || answer === "drifted") {
      return { applied: "routing_close" }; // UI opens closing ceremony
    }
    if (answer === "guidance" || answer === "share_feedback") {
      await this.event(pulse.connectionId, "guidance_requested", userId);
      return { applied: "routing_guidance" }; // UI opens feedback -> admin inbox
    }
    return { applied: "recorded" };
  }

  // ------------------------------------------------------------------- views

  async getJourneyView(connectionId: string, viewerUserId: string): Promise<JourneyView> {
    const journey = await this.requireJourney(connectionId);
    const side = this.sideOf(journey, viewerUserId);
    const summary = await this.repo.getConnectionSummary(connectionId);
    const counterpartCode = summary ? (side === "a" ? summary.userBCode : summary.userACode) : "K-??????";
    const ageOk = Date.now() - journey.matchedAt.getTime() >= COMPLETION_CONFIG.gateDays * DAY;
    const gateMet = Boolean(journey.revealGateUnlockedAt);
    const view: JourneyView = {
      connectionId,
      stage: journey.stage,
      counterpartCode,
      gate: {
        gateMet,
        daysRemaining: gateMet || ageOk ? 0 : Math.ceil((COMPLETION_CONFIG.gateDays - (Date.now() - journey.matchedAt.getTime()) / DAY)),
        messagesRemaining: gateMet ? 0 : Math.max(0, COMPLETION_CONFIG.gateMessages - journey.exchangeCount),
      },
      readiness: {
        selfReady: journey.revealReadyUserId === viewerUserId,
        otherReady: Boolean(journey.revealReadyUserId && journey.revealReadyUserId !== viewerUserId),
        primerStage:
          journey.stage === "chatting" && journey.revealReadyUserId && journey.revealReadyAt
            ? side === "a"
              ? journey.primerConfirmedA
                ? "awaiting_other"
                : "awaiting_self"
              : journey.primerConfirmedB
                ? "awaiting_other"
                : "awaiting_self"
            : "none",
        notYetCycles: journey.notYetCycleCount,
        zombieReflectionDue: journey.notYetCycleCount >= COMPLETION_CONFIG.zombieNotYetCycles,
      },
      stalled: Boolean(journey.stallRemindDueAt),
      blocked: Boolean(journey.stallBlockedAt),
    };
    return view;
  }

  // ------------------------------------------------------------ internals

  private async requireJourney(connectionId: string): Promise<PairingJourneyRow> {
    const journey = await this.repo.getPairingJourney(connectionId);
    if (!journey) throw new CompletionStateError("JOURNOTRACKED", "Pairing is not tracked yet.");
    return journey;
  }

  private sideOf(journey: PairingJourneyRow, userId: string): Side {
    if (journey.userAId === userId) return "a";
    if (journey.userBId === userId) return "b";
    throw new CompletionStateError("NOT_PARTICIPANT", "Viewer is not part of this pairing.");
  }

  private async revealCounterpartFor(journey: PairingJourneyRow, viewerUserId: string): Promise<RevealResult["counterpart"]> {
    const otherId = journey.userAId === viewerUserId ? journey.userBId : journey.userAId;
    const summary = await this.repo.getConnectionSummary(journey.connectionId);
    const identity = await this.repo.getIdentityCiphertexts(otherId);
    if (!identity?.legalNameCiphertext || !identity.phoneCiphertext) {
      throw new CompletionStateError("IDENTITY_INCOMPLETE", "The other person's registration is incomplete.");
    }
    return {
      publicCode: summary ? (journey.userAId === viewerUserId ? summary.userBCode : summary.userACode) : "K-??????",
      legalName: this.identityCipher.decrypt(identity.legalNameCiphertext, `${otherId}:legal-name`),
      phone: this.identityCipher.decrypt(identity.phoneCiphertext, `${otherId}:phone`),
    };
  }

  private async event(connectionId: string, kind: string, actorUserId: string | null, payload?: Record<string, unknown>): Promise<void> {
    await this.repo.insertPairingEvent({ connectionId, kind, actorUserId, payload: payload ?? {} });
  }
}
