import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  consentDraftSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";
import { CompletionService, COMPLETION_CONFIG, daysLater } from "../src/completion/completionService.js";
import { ConnectionService } from "../src/connections/connectionService.js";
import { RequestService } from "../src/requests/requestService.js";
import { DiscoveryService } from "../src/discovery/discoveryService.js";
import { AdminService } from "../src/admin/adminService.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

type ValueTag = z.infer<typeof valueTagSchema>;
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;
const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const onboarding = new OnboardingService(repository, cipher, true);
  const admin = new AdminService(repository, cipher);
  const discovery = new DiscoveryService(repository, cipher, true);
  const connections = new ConnectionService(repository, cipher, true);
  const requests = new RequestService(repository, cipher, true);
  const completion = new CompletionService(repository, cipher);
  return { repository, cipher, sessions, onboarding, admin, discovery, connections, requests, completion };
}

async function createCandidate(telegramId: bigint, gender: "female" | "male", env: Awaited<ReturnType<typeof setup>>) {
  const issued = await env.sessions.issueForTelegramUser(telegramId, new Date());
  const session = (await env.sessions.authenticate(issued.sessionToken))!;
  const userId = session.user.id;
  const patch: OnboardingProgressPatch = {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    currentStep: "public_preview",
    expectedVersion: 0,
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      publicProfile: {
        gender, countryCode: "ET", city: "Addis Ababa", educationLevel: "bachelors" as const,
        fieldOfStudy: "General", employmentStatus: "employed" as const,
        occupationCategory: "Office", maritalStatus: "never_married" as const,
        hasChildren: false, heightCm: 170,
      },
      faithAndFamily: {
        faithTradition: "ethiopian_orthodox_tewahedo" as const, marriageIntention: "teklil" as const,
        wantsChildren: "yes" as const, values: ["active_faith", "honesty", "family_oriented"] as ValueTag[],
        bio: "Completion service test bio long enough to satisfy the minimum bio length validation.",
        hasGodfather: true, isDeacon: false, churchServiceActive: true, hasDisability: false,
      },
      partnerPreferences: {
        ageMin: 22, ageMax: 40, preferredCities: ["Addis Ababa"], openToAbroad: false,
        acceptedMaritalStatuses: ["never_married" as const], acceptsPartnerWithChildren: false,
        desiredValues: ["active_faith" as ValueTag], acceptedMarriageIntentions: ["teklil" as const],
        additionalPreferences: "",
      },
    },
  };
  const saved = await env.onboarding.saveProgress(userId, patch);
  await env.onboarding.savePrivateIdentity(userId, {
    fullName: `Secret ${telegramId}`,
    dateOfBirth: "1996-01-01",
    phoneNumber: `+2519${String(telegramId % 100000000n).padStart(8, "0")}`,
    verificationPhotoStatus: "pending_upload",
  });
  await env.onboarding.saveVerificationPhoto(userId, { dataUrl: JPEG });
  await env.onboarding.submit(userId, {
    expectedVersion: saved.version,
    consent: consentDraftSchema.parse({
      informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
      discoveryPublication: true, verificationPhotoRetention: true, communityRules: true, botNotifications: false,
    }),
  });
  const user = (await env.sessions.authenticate(issued.sessionToken))!.user;
  await env.admin.decide(user.publicCode, { decision: "approved" });
  return { userId, publicCode: user.publicCode, fullName: `Secret ${telegramId}` };
}

/** Full funnel: request -> accept -> both confirm -> admin approves -> connected. */
async function connectedPair(env: Awaited<ReturnType<typeof setup>>, manSeed = 61n, womanSeed = 62n) {
  const man = await createCandidate(BigInt(`8000000000000${manSeed}`), "male", env);
  const woman = await createCandidate(BigInt(`8000000000000${womanSeed}`), "female", env);
  await env.discovery.recordDecision(man.userId, {
    targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
  });
  await env.requests.sendRequest(man.userId, { targetPublicCode: woman.publicCode, idempotencyKey: crypto.randomUUID() });
  const incoming = await env.requests.listIncoming(woman.userId);
  const requestId = incoming.requests[0]!.requestId;
  const accepted = await env.requests.respond(woman.userId, requestId, true);
  const pair = accepted.connectionId!;
  await env.connections.confirm(man.userId, pair, true);
  await env.connections.confirm(woman.userId, pair, true);
  await env.connections.decide(pair, true);
  const t0 = new Date("2026-09-01T10:00:00Z");
  await env.completion.onConnected({ connectionId: pair, userAId: man.userId, userBId: woman.userId, now: t0 });
  return { pair, man, woman, t0 };
}

async function chat(env: Awaited<ReturnType<typeof setup>>, pair: string, from: string, body: string, now: Date) {
  await env.connections.postMessage(from, pair, { body }, now);
  await env.completion.onMessage({ connectionId: pair, senderUserId: from, now });
}

describe("Kidan Completion — gate & readiness loop", () => {
  it("gate unlocks only at 7 days AND 20 combined messages", async () => {
    const env = await setup();
    const { pair, man, woman, t0 } = await connectedPair(env);
    // 19 msgs + enough days -> not unlocked
    for (let i = 0; i < 19; i += 1) {
      await chat(env, pair, i % 2 ? man.userId : woman.userId, `Message number ${i} in the thread`, daysLater(t0, 8));
    }
    let journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.revealGateUnlockedAt).toBeNull();
    // 20th msg but only 3 days -> not unlocked
    const env2 = await setup();
    const { pair: pair2, man: man2, woman: woman2, t0: t2 } = await connectedPair(env2, 71n, 72n);
    for (let i = 0; i < 20; i += 1) {
      await chat(env2, pair2, i % 2 ? man2.userId : woman2.userId, `Early exchange ${i} today`, daysLater(t2, 3));
    }
    journey = (await env2.repository.getPairingJourney(pair2))!;
    expect(journey.revealGateUnlockedAt).toBeNull();
    // one more exchange on day 8 -> unlocked
    await chat(env2, pair2, man2.userId, "Twenty first message late", daysLater(t2, 8));
    journey = (await env2.repository.getPairingJourney(pair2))!;
    expect(journey.revealGateUnlockedAt).not.toBeNull();
  });

  it("readiness cannot be answered before the gate is met", async () => {
    const env = await setup();
    const { pair, man, t0 } = await connectedPair(env);
    await expect(env.completion.answerReadiness(pair, man.userId, "ready", daysLater(t0, 2))).rejects.toMatchObject({ code: "GATE_NOT_MET" });
  });

  it("both not_ready continues the path without penalty; repeated cycles warn gently", async () => {
    const env = await setup();
    const { pair, man, woman, t0 } = await connectedPair(env);
    const late = daysLater(t0, 9);
    for (let i = 0; i < 20; i += 1) await chat(env, pair, i % 2 ? man.userId : woman.userId, `Exchange ${i}`, late);
    // cycle 1: man yes, woman not yet -> one-sided expiring? not yet resolves pending
    expect((await env.completion.answerReadiness(pair, man.userId, "ready", late)).state).toBe("one_sided");
    expect((await env.completion.answerReadiness(pair, woman.userId, "not_yet", daysLater(late, 1))).state).toBe("continue_chatting");
    let journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.notYetCycleCount).toBe(1);
    // cycles 2 & 3 -> zombie reflection surfaced
    await env.completion.answerReadiness(pair, man.userId, "ready", daysLater(late, 8));
    await env.completion.answerReadiness(pair, woman.userId, "not_yet", daysLater(late, 9));
    await env.completion.answerReadiness(pair, woman.userId, "ready", daysLater(late, 16));
    const result = await env.completion.answerReadiness(pair, man.userId, "not_yet", daysLater(late, 17));
    expect(result.state).toBe("zombie_reflection");
    journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.notYetCycleCount).toBe(3);
  });

  it("mutual ready -> primer -> simultaneous confirm -> name+phone revealed once", async () => {
    const env = await setup();
    const { pair, man, woman, t0 } = await connectedPair(env);
    const late = daysLater(t0, 10);
    for (let i = 0; i < 20; i += 1) await chat(env, pair, i % 2 ? man.userId : woman.userId, `Exchange ${i}`, late);
    expect((await env.completion.answerReadiness(pair, woman.userId, "ready", late)).state).toBe("one_sided");
    expect((await env.completion.answerReadiness(pair, man.userId, "ready", late)).state).toBe("both_ready");
    // primer: first confirm does not reveal
    const first = await env.completion.confirmReveal(pair, woman.userId, late);
    expect(first.revealed).toBe(false);
    // second confirm reveals; caller receives the OTHER side's identity
    const second = await env.completion.confirmReveal(pair, man.userId, late);
    expect(second.revealed).toBe(true);
    expect(second.counterpart!.legalName).toBe(woman.fullName);
    expect(second.counterpart!.phone).toMatch(/^\+2519/);
    // both sides read the same unveiled identity afterwards
    const forWoman = await env.completion.getRevealedCounterpart(pair, woman.userId);
    expect(forWoman.legalName).toBe(man.fullName);
    const journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stage).toBe("revealed");
    expect(journey.revealedAt).not.toBeNull();
  });

  it("one-sided yes expires after 7 days without the other side; timer resets for the loop", async () => {
    const env = await setup();
    const { pair, man, woman, t0 } = await connectedPair(env);
    const late = daysLater(t0, 9);
    for (let i = 0; i < 20; i += 1) await chat(env, pair, i % 2 ? man.userId : woman.userId, `Exchange ${i}`, late);
    await env.completion.answerReadiness(pair, man.userId, "ready", late);
    const before = (await env.repository.getPairingJourney(pair))!;
    expect(before.revealReadyUserId).toBe(man.userId);
    // tick past the expiry window
    await env.completion.tick(daysLater(late, 8));
    const after = (await env.repository.getPairingJourney(pair))!;
    expect(after.revealReadyUserId).toBeNull();
    // the loop re-asked both sides (readiness dispatches)
    const dispatches = await env.completion.tick(daysLater(late, 8));
    const kinds = dispatches.filter((d) => d.kind === "readiness").map((d) => d.userId).sort();
    expect(kinds).toEqual([man.userId, woman.userId].sort());
  });
});

describe("Kidan Completion — stall machinery & closing", () => {
  it("silent side: reminder first, then hard block on new picks", async () => {
    const env = await setup();
    const { pair, man, woman, t0 } = await connectedPair(env);
    // woman goes quiet: only man stays active
    for (let i = 0; i < 3; i += 1) await chat(env, pair, man.userId, `Still here ${i}`, daysLater(t0, i + 1));
    const d1 = await env.completion.tick(daysLater(t0, COMPLETION_CONFIG.staleDays + 1));
    const reminded = d1.filter((d) => d.type === "stall_reminder").map((d) => d.userId);
    expect(reminded).toContain(woman.userId);
    let journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stallRemindDueAt).not.toBeNull();
    expect(journey.stallBlockedAt).toBeNull();
    // block only after the remind grace period
    await env.completion.tick(daysLater(t0, COMPLETION_CONFIG.staleDays + COMPLETION_CONFIG.stallBlockAfterRemindDays + 2));
    journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stallBlockedAt).not.toBeNull();
    expect(await env.completion.isNewPickBlocked(woman.userId)).toBe(true);
    expect(await env.completion.isNewPickBlocked(man.userId)).toBe(true); // path blocks both until closed or revived
    // a message from the silent side is what revives the path (activity resets in onMessage)
    await chat(env, pair, woman.userId, "I am back, apologies", daysLater(t0, COMPLETION_CONFIG.staleDays + COMPLETION_CONFIG.stallBlockAfterRemindDays + 3));
    journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.lastActiveAtB.getTime() > journey.stallBlockedAt!.getTime()).toBe(true);
  });

  it("clean closing schedules a follow-up ~3 days out and closes the connection", async () => {
    const env = await setup();
    const { pair, man, t0 } = await connectedPair(env);
    const t1 = daysLater(t0, 5);
    const { followupDueAt } = await env.completion.requestClose(pair, man.userId, t1, "values_mismatch");
    expect(Math.round((followupDueAt.getTime() - t1.getTime()) / DAY)).toBe(COMPLETION_CONFIG.closingFollowupDelayDays);
    const journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stage).toBe("decoupled");
    expect(journey.decoupledByUserId).toBe(man.userId);
    const connection = await env.repository.getConnectionSummary(pair);
    expect(connection!.status).toBe("closed");
    await expect(env.completion.requestClose(pair, man.userId, t1)).rejects.toMatchObject({ code: "ALREADY_CLOSED" });
  });

  it("Together report is allowed only post-reveal (self-report)", async () => {
    const env = await setup();
    const { pair, man, t0 } = await connectedPair(env);
    await expect(env.completion.reportTogether(pair, man.userId, daysLater(t0, 2))).rejects.toMatchObject({ code: "NOT_REVEALED" });
  });
});

describe("Kidan Completion — pulses", () => {
  it("first check-in pulse is due day +3 per side, answering records and revives activity", async () => {
    const env = await setup();
    const { pair, man, woman, t0 } = await connectedPair(env);
    const d1 = await env.completion.tick(daysLater(t0, 3));
    expect(d1.filter((d) => d.kind === "check_in")).toHaveLength(2);
    const pulsesA = await env.repository.listPairingPulses({ connectionId: pair, userId: man.userId, limit: 5 });
    expect(pulsesA).toHaveLength(1);
    const pulse = pulsesA[0]!;
    expect(pulse.kind).toBe("check_in");
    expect(pulse.answeredAt).toBeNull();
    const result = await env.completion.answerPulse(pulse.id, man.userId, "going_well", daysLater(t0, 3.5));
    expect(result.applied).toBe("recorded");
    const journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.lastActiveAtA.getTime()).toBeGreaterThan(t0.getTime());
    const events = await env.repository.listPairingPulses({ connectionId: pair, userId: woman.userId, limit: 5 });
    expect(events[0]!.answeredAt).toBeNull();
  });

  it("drifted/part answers route to the closing flow; guidance routes to feedback", async () => {
    const env = await setup();
    const { pair, woman, man, t0 } = await connectedPair(env);
    await env.completion.tick(daysLater(t0, 3));
    const pWoman = (await env.repository.listPairingPulses({ connectionId: pair, userId: woman.userId, limit: 1 }))[0]!;
    expect((await env.completion.answerPulse(pWoman.id, woman.userId, "drifted", daysLater(t0, 3.5))).applied).toBe("routing_close");
    await env.completion.requestClose(pair, woman.userId, daysLater(t0, 4), "drifting");
    const pMan = (await env.repository.listPairingPulses({ connectionId: pair, userId: man.userId, limit: 1 }))[0]!;
    expect((await env.completion.answerPulse(pMan.id, man.userId, "guidance", daysLater(t0, 5))).applied).toBe("routing_guidance");
  });

  it("readiness pulses feed the loop (ready -> both_ready when mutual)", async () => {
    const env = await setup();
    const { pair, man, woman, t0 } = await connectedPair(env);
    const late = daysLater(t0, 10);
    for (let i = 0; i < 20; i += 1) await chat(env, pair, i % 2 ? man.userId : woman.userId, `Ping ${i}`, late);
    await env.completion.tick(late); // -> readiness dispatches + pulse rows
    const readyPulsesMan = await env.repository.listPairingPulses({ connectionId: pair, userId: man.userId, limit: 5 });
    const rMan = readyPulsesMan.find((p) => p.kind === "readiness")!;
    const rWoman = (await env.repository.listPairingPulses({ connectionId: pair, userId: woman.userId, limit: 5 })).find((p) => p.kind === "readiness")!;
    expect(await (await env.completion.answerPulse(rWoman.id, woman.userId, "ready", late)).applied).toBe("readiness");
    expect((await env.completion.answerPulse(rMan.id, man.userId, "ready", daysLater(late, 1))).applied).toBe("readiness");
    const j = (await env.repository.getPairingJourney(pair))!;
    expect(j.revealReadyUserId).toBe(man.userId);
  });
});
