import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OnboardingProgressPatch } from "@kidan/contracts";
import { AdminService } from "../../src/admin/adminService.js";
import { SessionService } from "../../src/auth/sessionService.js";
import { CompletionService } from "../../src/completion/completionService.js";
import { ConnectionService } from "../../src/connections/connectionService.js";
import { DiscoveryService } from "../../src/discovery/discoveryService.js";
import { OnboardingService } from "../../src/onboarding/onboardingService.js";
import { PostgresPersistenceRepository } from "../../src/persistence/postgresRepository.js";
import { RequestService } from "../../src/requests/requestService.js";
import type { UserRecord } from "../../src/persistence/types.js";
import { IdentityCipher, SecretHasher } from "../../src/security/crypto.js";
import { createIntegrationHarness, type IntegrationHarness } from "./harness.js";

/**
 * Schedule-side correctness for the Kidan Completion closing follow-up drain.
 * The in-memory suite (completionService.test.ts / completionPhase2.test.ts) proves
 * semantics; this suite proves the POSTGRESQL claim is atomic under concurrency —
 * two overlapping cron ticks must never notify the same pair twice.
 */

const encryptionKey = randomBytes(32);
const lookupKey = randomBytes(32);
const sessionKey = randomBytes(32);

const DAY = 24 * 60 * 60 * 1000;

let harness: IntegrationHarness;
let repository: PostgresPersistenceRepository;
let cipher: IdentityCipher;
let sessions: SessionService;
let onboarding: OnboardingService;
let completion: CompletionService;
let nextTelegramId = 900_800_000_000_000n;
let phoneCounter = 0;

function uniquePhone(): string {
  phoneCounter += 1;
  return `+2519${(20_000_000 + phoneCounter).toString().padStart(8, "0")}`;
}

function makePatch(gender: "female" | "male"): OnboardingProgressPatch {
  return {
    schemaVersion: "2026-08-12.v1",
    expectedVersion: 0,
    currentStep: "public_preview",
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      publicProfile: {
        gender, countryCode: "ET", city: "Addis Ababa", educationLevel: "bachelors",
        fieldOfStudy: "Public health", employmentStatus: "employed", occupationCategory: "Healthcare",
        maritalStatus: "never_married", hasChildren: false, heightCm: 165,
      },
      faithAndFamily: {
        faithTradition: "ethiopian_orthodox_tewahedo", marriageIntention: "teklil",
        wantsChildren: "yes", values: ["active_faith", "honesty", "family_oriented"],
        bio: "Synthetic information used for PostgreSQL completion-drain integration testing.",
        hasGodfather: true, isDeacon: false, churchServiceActive: true, hasDisability: false,
      },
      partnerPreferences: {
        ageMin: 28, ageMax: 36, preferredCities: ["Addis Ababa"], openToAbroad: false,
        acceptedMaritalStatuses: ["never_married"], acceptsPartnerWithChildren: false,
        desiredValues: ["active_faith"], acceptedMarriageIntentions: ["teklil"], additionalPreferences: "",
      },
    },
  };
}

async function newUser(): Promise<UserRecord> {
  const issued = await sessions.issueForTelegramUser(nextTelegramId++, new Date());
  const session = await sessions.authenticate(issued.sessionToken);
  if (!session) throw new Error("session creation failed");
  return session.user;
}

async function completeSubmission(user: UserRecord, gender: "female" | "male"): Promise<void> {
  const draft = await onboarding.saveProgress(user.id, makePatch(gender));
  await onboarding.savePrivateIdentity(user.id, {
    fullName: "Demo Candidate", dateOfBirth: "1996-01-01", phoneNumber: uniquePhone(),
  });
  await onboarding.saveVerificationPhoto(user.id, {
    dataUrl: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`,
  });
  await onboarding.submit(user.id, {
    expectedVersion: draft.version,
    consent: {
      informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
      discoveryPublication: true, verificationPhotoRetention: true, communityRules: true,
      botNotifications: false,
    },
  });
}

async function approvedPair(): Promise<{ man: UserRecord; woman: UserRecord }> {
  const admin = new AdminService(repository, cipher);
  const man = await newUser();
  await completeSubmission(man, "male");
  await admin.decide(man.publicCode, { decision: "approved" });
  const woman = await newUser();
  await completeSubmission(woman, "female");
  await admin.decide(woman.publicCode, { decision: "approved" });
  return { man, woman };
}

async function connectedPair(): Promise<{ man: UserRecord; woman: UserRecord; connectionId: string }> {
  const { man, woman } = await approvedPair();
  const discovery = new DiscoveryService(repository, cipher, true);
  const requests = new RequestService(repository, cipher, true);
  const connections = new ConnectionService(repository, cipher, true);
  await discovery.recordDecision(man.id, {
    targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
  });
  await requests.sendRequest(man.id, {
    targetPublicCode: woman.publicCode, idempotencyKey: crypto.randomUUID(),
  });
  const incoming = (await requests.listIncoming(woman.id)).requests;
  const item = incoming.find((r) => r.profile.publicCode === man.publicCode)!;
  const responded = await requests.respond(woman.id, item.requestId, true);
  if (!responded.connectionId) throw new Error("accepting a request did not create a connection");
  await connections.confirm(man.id, responded.connectionId, true);
  await connections.confirm(woman.id, responded.connectionId, true);
  await connections.decide(responded.connectionId, true);
  return { man, woman, connectionId: responded.connectionId };
}

/** Connects a pair, starts their pairing journey, and has one side close it at `now`. */
async function decoupledJourney(now: Date): Promise<{ man: UserRecord; woman: UserRecord; connectionId: string }> {
  const pair = await connectedPair();
  await completion.onConnected({ connectionId: pair.connectionId, now });
  const { followupDueAt } = await completion.requestClose(pair.connectionId, pair.man.id, now, "integration test");
  expect(followupDueAt.getTime()).toBe(now.getTime() + 3 * DAY);
  return pair;
}

const followupPulses = async (connectionId: string) =>
  (await harness.pool.query<{ user_id: string }>(
    "SELECT user_id FROM pairing_pulse WHERE connection_id = $1 AND kind = 'closing_followup' ORDER BY user_id",
    [connectionId],
  )).rows;

beforeAll(async () => {
  harness = await createIntegrationHarness();
  repository = new PostgresPersistenceRepository(harness.pool);
  cipher = new IdentityCipher(encryptionKey, lookupKey);
  sessions = new SessionService(repository, cipher, new SecretHasher(sessionKey));
  onboarding = new OnboardingService(repository, cipher, true);
  completion = new CompletionService(repository, cipher);
});

afterAll(async () => {
  await harness?.cleanup();
});

describe("PostgreSQL completion drain (closing follow-up)", () => {
  it("schedules the +3d follow-up on close and the tick dispatches it exactly once", async () => {
    const t0 = new Date("2026-09-01T08:00:00.000Z");
    const { connectionId } = await decoupledJourney(t0);

    const journey = await repository.getPairingJourney(connectionId);
    expect(journey?.stage).toBe("decoupled");
    expect(journey?.closingFollowupDueAt?.getTime()).toBe(t0.getTime() + 3 * DAY);

    // Not due yet -> nothing claimed, nothing dispatched.
    const early = await completion.tick(new Date(t0.getTime() + 2 * DAY));
    expect(early.filter((d) => d.kind === "closing_followup")).toHaveLength(0);
    expect(await followupPulses(connectionId)).toHaveLength(0);

    // Due -> one pulse per side, dispatched exactly once.
    const dueAt = new Date(t0.getTime() + 3 * DAY);
    const due = await completion.tick(dueAt);
    const followups = due.filter((d) => d.kind === "closing_followup" && d.connectionId === connectionId);
    expect(followups).toHaveLength(2);
    expect(followups.every((d) => d.type === "pulse")).toBe(true);

    const pulses = await followupPulses(connectionId);
    expect(pulses).toHaveLength(2);

    // The claim cleared closing_followup_due_at: a later tick must not re-send.
    const late = await completion.tick(new Date(t0.getTime() + 4 * DAY));
    expect(late.filter((d) => d.kind === "closing_followup" && d.connectionId === connectionId)).toHaveLength(0);
    expect(await followupPulses(connectionId)).toHaveLength(2);

    const after = await repository.getPairingJourney(connectionId);
    expect(after?.closingFollowupDueAt).toBeNull();
  });

  it("claims each decoupled journey at most once even when ticks overlap", async () => {
    const t0 = new Date("2026-09-02T08:00:00.000Z");
    const pairs = [await decoupledJourney(t0), await decoupledJourney(t0), await decoupledJourney(t0)];
    const ids = new Set(pairs.map((p) => p.connectionId));
    expect(ids.size).toBe(3);

    const dueAt = new Date(t0.getTime() + 3 * DAY);
    // Three overlapping claims (the pool hands each its own connection/transaction).
    const claims = await Promise.all([
      repository.claimDueClosingFollowups(dueAt, 10),
      repository.claimDueClosingFollowups(dueAt, 10),
      repository.claimDueClosingFollowups(dueAt, 10),
    ]);
    const claimedIds = claims.flat().map((j) => j.connectionId);
    // No journey is claimed twice across overlapping ticks...
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    // ...and every due journey IS claimed (no lost follow-up).
    expect(new Set(claimedIds)).toEqual(ids);

    // Post-claim state: all are fully drained.
    const after = await harness.pool.query("SELECT COUNT(*)::int AS n FROM pairing_journey WHERE closing_followup_due_at IS NOT NULL");
    expect(after.rows[0]!.n).toBe(0);
  });

  it("drains in due-time order and honours the batch limit", async () => {
    const t0 = new Date("2026-09-03T08:00:00.000Z");
    // First pair closed a day earlier, so its follow-up comes due a day earlier.
    const earlier = await decoupledJourney(new Date(t0.getTime() - DAY));
    const later = await decoupledJourney(t0);

    const first = await repository.claimDueClosingFollowups(new Date(t0.getTime() + 2 * DAY), 1);
    expect(first).toHaveLength(1);
    expect(first[0]!.connectionId).toBe(earlier.connectionId);

    // Earlier one was claimed and cleared; next drain gets the later one.
    const second = await repository.claimDueClosingFollowups(new Date(t0.getTime() + 3 * DAY), 1);
    expect(second).toHaveLength(1);
    expect(second[0]!.connectionId).toBe(later.connectionId);

    expect((await repository.claimDueClosingFollowups(new Date(t0.getTime() + 3 * DAY), 10))).toHaveLength(0);
  });
});

/**
 * The candidate-facing pairing journey on real Postgres (the same paths the
 * miniapp routes in src/routes/pairings.ts call): readiness loop -> primer ->
 * simultaneous reveal -> Together / clean close, plus the privacy partition —
 * a non-participant must be indistinguishable from a missing pairing.
 */
describe("PostgreSQL pairing journey lifecycle (miniapp surface)", () => {
  it("runs readiness -> primer -> reveal and unveils the counterpart to both sides", async () => {
    const t0 = new Date("2026-09-05T08:00:00.000Z");
    const pair = await connectedPair();
    await completion.onConnected({ connectionId: pair.connectionId, now: t0 });

    // The gate is closed before 7 days AND 20 combined messages.
    const earlyView = await completion.getJourneyView(pair.connectionId, pair.man.id);
    expect(earlyView.gate.gateMet).toBe(false);
    await expect(
      completion.answerReadiness(pair.connectionId, pair.man.id, "ready", t0),
    ).rejects.toMatchObject({ code: "GATE_NOT_MET" });

    // Cross the gate: 10 messages each way, check in like real usage.
    for (let i = 0; i < 10; i += 1) {
      const now = new Date(t0.getTime() + (i + 1) * 60_000);
      await completion.onMessage({ connectionId: pair.connectionId, senderUserId: pair.man.id, now });
      await completion.onMessage({ connectionId: pair.connectionId, senderUserId: pair.woman.id, now });
    }
    await completion.tick(new Date(t0.getTime() + 7 * DAY));
    const unlocked = await completion.getJourneyView(pair.connectionId, pair.man.id);
    expect(unlocked.gate).toEqual({ gateMet: true, daysRemaining: 0, messagesRemaining: 0 });

    // One ready, one waiting: one-sided "K-XXXXXX is ready when you are".
    const oneSided = await completion.answerReadiness(
      pair.connectionId, pair.man.id, "ready", new Date(t0.getTime() + 7 * DAY + 60_000),
    );
    expect(oneSided.state).toBe("one_sided");
    const womanView = await completion.getJourneyView(pair.connectionId, pair.woman.id);
    expect(womanView.readiness.otherReady).toBe(true);
    expect(womanView.readiness.selfReady).toBe(false);

    // Both ready -> primer stage; first confirm waits, second confirm reveals.
    const both = await completion.answerReadiness(
      pair.connectionId, pair.woman.id, "ready", new Date(t0.getTime() + 7 * DAY + 2 * 60_000),
    );
    expect(both.state).toBe("both_ready");
    const manConfirm = await completion.confirmReveal(
      pair.connectionId, pair.man.id, new Date(t0.getTime() + 7 * DAY + 3 * 60_000),
    );
    expect(manConfirm.revealed).toBe(false);
    await expect(completion.getRevealedCounterpart(pair.connectionId, pair.man.id)).rejects.toMatchObject({ code: "NOT_REVEALED" });
    const womanConfirm = await completion.confirmReveal(
      pair.connectionId, pair.woman.id, new Date(t0.getTime() + 7 * DAY + 4 * 60_000),
    );
    expect(womanConfirm.revealed).toBe(true);
    expect(womanConfirm.counterpart).toMatchObject({ legalName: "Demo Candidate" });
    // Read-back on both sides (the reveal success screen reload path).
    const forMan = await completion.getRevealedCounterpart(pair.connectionId, pair.man.id);
    expect(forMan.legalName).toBe("Demo Candidate");
    const afterView = await completion.getJourneyView(pair.connectionId, pair.man.id);
    expect(afterView.stage).toBe("revealed");

    // Together self-report completes the journey.
    await completion.reportTogether(pair.connectionId, pair.man.id, new Date(t0.getTime() + 8 * DAY));
    expect((await completion.getJourneyView(pair.connectionId, pair.woman.id)).stage).toBe("completed_together");
    // Closing after completion is a no-op transition, not a 500.
    await expect(
      completion.requestClose(pair.connectionId, pair.man.id, new Date(t0.getTime() + 8 * DAY)),
    ).resolves.toBeTruthy();
  });

  it("keeps every route-facing call private: a non-participant gets the same error as a missing pairing", async () => {
    const t0 = new Date("2026-09-05T09:00:00.000Z");
    const pair = await connectedPair();
    await completion.onConnected({ connectionId: pair.connectionId, now: t0 });
    const outsider = (await approvedPair()).man;
    for (const call of [
      () => completion.getJourneyView(pair.connectionId, outsider.id),
      () => completion.answerReadiness(pair.connectionId, outsider.id, "ready", t0),
      () => completion.confirmReveal(pair.connectionId, outsider.id, t0),
      () => completion.getRevealedCounterpart(pair.connectionId, outsider.id),
      () => completion.requestClose(pair.connectionId, outsider.id, t0),
      () => completion.reportTogether(pair.connectionId, outsider.id, t0),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "NOT_PARTICIPANT" });
    }
  });

  it("the respectful close schedules the follow-up and a second close is ALREADY_CLOSED", async () => {
    const t0 = new Date("2026-09-05T10:00:00.000Z");
    const pair = await decoupledJourney(t0);
    expect((await completion.getJourneyView(pair.connectionId, pair.woman.id)).stage).toBe("decoupled");
    await expect(completion.requestClose(pair.connectionId, pair.woman.id, t0)).rejects.toMatchObject({
      code: "ALREADY_CLOSED",
    });
  });
});
