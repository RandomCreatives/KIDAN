import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
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
import type { PairingEventRow } from "../src/persistence/types.js";
import { buildApp } from "../src/appFactory.js";
import type { FastifyInstance } from "fastify";

type ValueTag = z.infer<typeof valueTagSchema>;
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;

/** Test-only handle to inspect recorded journey lifecycle events. */
function pairingEvents(repository: MemoryPersistenceRepository): PairingEventRow[] {
  return (repository as unknown as { pairingEvents: PairingEventRow[] }).pairingEvents;
}

interface HookCalls {
  connected: { connectionId: string; now: Date }[];
  messages: { connectionId: string; senderUserId: string; now: Date }[];
}

/**
 * Sets up the full app-service stack with the Completion lifecycle WIRED
 * through ConnectionService (as runtimeApp does), so hooks are exercised
 * through the real request -> confirm -> approve -> message flow.
 */
async function setup() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const onboarding = new OnboardingService(repository, cipher, true);
  const admin = new AdminService(repository, cipher);
  const discovery = new DiscoveryService(repository, cipher, true);
  const completion = new CompletionService(repository, cipher);
  const hooks: HookCalls = { connected: [], messages: [] };
  const connections = new ConnectionService(repository, cipher, true, undefined, {
    onConnected: async (connectionId, now) => {
      hooks.connected.push({ connectionId, now });
      await completion.onConnected({ connectionId, now });
    },
    onIntroductionMessage: async (connectionId, senderUserId, now) => {
      hooks.messages.push({ connectionId, senderUserId, now });
      await completion.onMessage({ connectionId, senderUserId, now });
    },
  });
  const requests = new RequestService(repository, cipher, true, undefined, undefined, (userId) =>
    completion.isNewPickBlocked(userId),
  );
  return { repository, cipher, sessions, onboarding, admin, discovery, connections, requests, completion, hooks };
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
        bio: "Phase 2 wiring test bio long enough to satisfy the minimum bio length validation.",
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
    fullName: `Phase2 ${telegramId}`,
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
  return { userId, publicCode: user.publicCode };
}

/** Full funnel with Completion hooks flowing through ConnectionService. */
async function connectedPair(env: Awaited<ReturnType<typeof setup>>, manSeed = 241n, womanSeed = 242n) {
  const man = await createCandidate(BigInt(`8000000000000${manSeed}`), "male", env);
  const woman = await createCandidate(BigInt(`8000000000000${womanSeed}`), "female", env);
  await env.discovery.recordDecision(man.userId, {
    targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
  });
  await env.requests.sendRequest(man.userId, { targetPublicCode: woman.publicCode, idempotencyKey: crypto.randomUUID() });
  const incoming = await env.requests.listIncoming(woman.userId);
  const accepted = await env.requests.respond(woman.userId, incoming.requests[0]!.requestId, true);
  const pair = accepted.connectionId!;
  await env.connections.confirm(man.userId, pair, true);
  await env.connections.confirm(woman.userId, pair, true);
  await env.connections.decide(pair, true);
  return { pair, man, woman };
}

describe("Kidan Completion (Phase 2) — service wiring", () => {
  it("approving a connection fires onConnected exactly once and seeds the journey", async () => {
    const env = await setup();
    const { pair } = await connectedPair(env);
    expect(env.hooks.connected).toHaveLength(1);
    expect(env.hooks.connected[0]!.connectionId).toBe(pair);
    const journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stage).toBe("chatting");
  });

  it("posting an introduction message fires onIntroductionMessage and tracks activity", async () => {
    const env = await setup();
    const { pair, man } = await connectedPair(env);
    const now = new Date("2026-09-05T12:00:00Z");
    await env.connections.postMessage(man.userId, pair, { body: "Selam, how has your week been?" }, now);
    expect(env.hooks.messages).toHaveLength(1);
    expect(env.hooks.messages[0]).toMatchObject({ connectionId: pair, senderUserId: man.userId });
    const journey = (await env.repository.getPairingJourney(pair))!;
    // connection row A/B ordering is nondeterministic (min-uuid first) — resolve the sender's side
    const senderActive = journey.userAId === man.userId ? journey.lastActiveAtA : journey.lastActiveAtB;
    expect(senderActive.getTime()).toBe(now.getTime());
  });

  it("a stall-blocked user is refused new picks with PAIRING_NEEDS_ATTENTION", async () => {
    const env = await setup();
    const { pair, man, woman } = await connectedPair(env);
    const t0 = (await env.repository.getPairingJourney(pair))!.matchedAt;
    // woman goes quiet: only man stays active
    for (let i = 0; i < 3; i += 1) {
      await env.connections.postMessage(man.userId, pair, { body: `Still here ${i}` }, daysLater(t0, i + 1));
    }
    await env.completion.tick(daysLater(t0, COMPLETION_CONFIG.staleDays + 1));
    await env.completion.tick(daysLater(t0, COMPLETION_CONFIG.staleDays + COMPLETION_CONFIG.stallBlockAfterRemindDays + 2));
    expect(await env.completion.isNewPickBlocked(woman.userId)).toBe(true);
    // new pick from the stalled pair -> refused through RequestService
    const other = await createCandidate(BigInt("8000000000000250"), "female", env);
    await expect(
      env.requests.sendRequest(woman.userId, { targetPublicCode: other.publicCode, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow("PAIRING_NEEDS_ATTENTION");
  });
});

describe("Kidan Completion (Phase 2) — revive semantics", () => {
  it("a message from the stalled side clears stall flags and emits revived(via message)", async () => {
    const env = await setup();
    const { pair, man, woman } = await connectedPair(env);
    const t0 = (await env.repository.getPairingJourney(pair))!.matchedAt;
    for (let i = 0; i < 3; i += 1) {
      await env.connections.postMessage(man.userId, pair, { body: `Man active ${i}` }, daysLater(t0, i + 1));
    }
    await env.completion.tick(daysLater(t0, COMPLETION_CONFIG.staleDays + 1));
    await env.completion.tick(daysLater(t0, COMPLETION_CONFIG.staleDays + COMPLETION_CONFIG.stallBlockAfterRemindDays + 2));
    let journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stallBlockedAt).not.toBeNull();
    expect(await env.completion.isNewPickBlocked(woman.userId)).toBe(true);
    // the silent side comes back with a message
    const back = daysLater(t0, COMPLETION_CONFIG.staleDays + COMPLETION_CONFIG.stallBlockAfterRemindDays + 3);
    await env.connections.postMessage(woman.userId, pair, { body: "I am back, apologies for the silence" }, back);
    journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stallRemindDueAt).toBeNull();
    expect(journey.stallBlockedAt).toBeNull();
    expect(await env.completion.isNewPickBlocked(woman.userId)).toBe(false);
    expect(pairingEvents(env.repository).some((e) => e.kind === "revived" && (e.payload as { via?: string }).via === "message")).toBe(true);
  });

  it("answering a plan check-in from the stalled side revives with revived(via pulse)", async () => {
    const env = await setup();
    const { pair, man, woman } = await connectedPair(env);
    const t0 = (await env.repository.getPairingJourney(pair))!.matchedAt;
    for (let i = 0; i < 3; i += 1) {
      await env.connections.postMessage(man.userId, pair, { body: `Man active ${i}` }, daysLater(t0, i + 1));
    }
    await env.completion.tick(daysLater(t0, COMPLETION_CONFIG.staleDays + 1));
    let journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stallRemindDueAt).not.toBeNull();
    const pulses = await env.repository.listPairingPulses({ connectionId: pair, userId: woman.userId, limit: 5 });
    const probe = pulses.find((p) => p.kind === "stall_probe")!;
    expect(probe).toBeTruthy();
    await env.completion.answerPulse(probe.id, woman.userId, "going_well", daysLater(t0, COMPLETION_CONFIG.staleDays + 2));
    journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.stallRemindDueAt).toBeNull();
    expect(pairingEvents(env.repository).some((e) => e.kind === "revived" && (e.payload as { via?: string }).via === "pulse")).toBe(true);
  });
});

describe("Kidan Completion (Phase 2) — closing follow-up", () => {
  it("tick delivers the +3d follow-up to both sides exactly once", async () => {
    const env = await setup();
    const { pair, man, woman } = await connectedPair(env);
    const t0 = (await env.repository.getPairingJourney(pair))!.matchedAt;
    const closedAt = daysLater(t0, 4);
    const { followupDueAt } = await env.completion.requestClose(pair, man.userId, closedAt, "values_mismatch");
    // before the due moment: nothing
    const early = await env.completion.tick(daysLater(closedAt, 1));
    expect(early.filter((d) => d.kind === "closing_followup")).toHaveLength(0);
    // at the due moment: one follow-up pulse per side
    const due = await env.completion.tick(followupDueAt);
    const followups = due.filter((d) => d.kind === "closing_followup").map((d) => d.userId).sort();
    expect(followups).toEqual([man.userId, woman.userId].sort());
    const pulsesA = await env.repository.listPairingPulses({ connectionId: pair, userId: man.userId, limit: 10 });
    expect(pulsesA.filter((p) => p.kind === "closing_followup")).toHaveLength(1);
    // claimed atomically: a second tick does not re-deliver
    const again = await env.completion.tick(daysLater(followupDueAt, 1));
    expect(again.filter((d) => d.kind === "closing_followup")).toHaveLength(0);
    const journey = (await env.repository.getPairingJourney(pair))!;
    expect(journey.closingFollowupDueAt).toBeNull();
    expect(pairingEvents(env.repository).filter((e) => e.kind === "closing_followup_due")).toHaveLength(1);
  });

  it("claimDueClosingFollowups returns due journeys up to the limit and clears their due stamp", async () => {
    const env = await setup();
    const first = await connectedPair(env);
    const t1 = (await env.repository.getPairingJourney(first.pair))!.matchedAt;
    const { followupDueAt } = await env.completion.requestClose(first.pair, first.man.userId, t1, "timing");
    const claimed = await env.repository.claimDueClosingFollowups(followupDueAt, 200);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.connectionId).toBe(first.pair);
    expect(claimed[0]!.closingFollowupDueAt).toBeNull();
    // not due (already claimed)
    expect(await env.repository.claimDueClosingFollowups(followupDueAt, 200)).toHaveLength(0);
  });
});

describe("Kidan Completion (Phase 2) — internal endpoints", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("completion tick endpoint enforces the cron bearer secret", async () => {
    let calls = 0;
    app = await buildApp({
      logger: false,
      completionTickSecret: "cronsecret",
      completionTick: async () => {
        calls += 1;
        return { due: 3, sent: 2 };
      },
    });
    const denied = await app.inject({ method: "GET", url: "/internal/completion/tick" });
    expect(denied.statusCode).toBe(401);
    const ok = await app.inject({
      method: "POST",
      url: "/internal/completion/tick",
      headers: { authorization: "Bearer cronsecret" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data).toEqual({ due: 3, sent: 2 });
    const okGet = await app.inject({
      method: "GET",
      url: "/internal/completion/tick",
      headers: { authorization: "Bearer cronsecret" },
    });
    expect(okGet.statusCode).toBe(200);
    expect(calls).toBe(2);
  });

  it("completion tick endpoint is absent without a configured secret", async () => {
    app = await buildApp({ logger: false });
    const response = await app.inject({ method: "POST", url: "/internal/completion/tick" });
    expect(response.statusCode).toBe(404);
  });

  it("pairing answer endpoint validates auth, body, and maps service codes to 409", async () => {
    app = await buildApp({
      logger: false,
      botStateSecret: "botsecret",
      pairingAnswer: async (telegramUserId, pulseId, answer) => {
        if (answer === "explode") throw Object.assign(new Error("nope"), { code: "PULSE_ALREADY_ANSWERED" });
        return { text: `ack:${telegramUserId}:${pulseId}:${answer}` };
      },
    });
    const denied = await app.inject({
      method: "POST",
      url: "/internal/pairing/answer",
      payload: { telegramId: 1, pulseId: "p", answer: "ready" },
    });
    expect(denied.statusCode).toBe(401);
    const invalid = await app.inject({
      method: "POST",
      url: "/internal/pairing/answer",
      headers: { authorization: "Bearer botsecret" },
      payload: { telegramId: -1, pulseId: "p", answer: "ready" },
    });
    expect(invalid.statusCode).toBe(400);
    const conflict = await app.inject({
      method: "POST",
      url: "/internal/pairing/answer",
      headers: { authorization: "Bearer botsecret" },
      payload: { telegramId: 7, pulseId: "p1", answer: "explode" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("PULSE_ALREADY_ANSWERED");
    const ok = await app.inject({
      method: "POST",
      url: "/internal/pairing/answer",
      headers: { authorization: "Bearer botsecret" },
      payload: { telegramId: 7, pulseId: "p1", answer: "ready" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.text).toBe("ack:7:p1:ready");
  });
});
