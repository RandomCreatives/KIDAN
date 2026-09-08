import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  consentDraftSchema,
  incomingRequestsResponseSchema,
  INTENTION_REQUEST_DAILY_CAP,
  outgoingRequestsResponseSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";
import { RequestService } from "../src/requests/requestService.js";
import { ConnectionService } from "../src/connections/connectionService.js";
import { DiscoveryService } from "../src/discovery/discoveryService.js";
import { AdminService } from "../src/admin/adminService.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

type ValueTag = z.infer<typeof valueTagSchema>;
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;
const HOUR = 60 * 60 * 1000;

async function createCandidate(
  telegramId: bigint,
  gender: "female" | "male",
  env: Awaited<ReturnType<typeof setup>>,
) {
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
        bio: "Request service test bio long enough to satisfy the minimum bio length validation rule.",
        hasGodfather: true,
        isDeacon: gender === "male" ? false : null,
        churchServiceActive: true,
        hasDisability: false,
      },
      partnerPreferences: {
        ageMin: 22, ageMax: 44, preferredCities: ["Addis Ababa"], openToAbroad: false,
        acceptedMaritalStatuses: ["never_married" as const], acceptsPartnerWithChildren: false,
        desiredValues: ["active_faith" as ValueTag], acceptedMarriageIntentions: ["teklil" as const],
        additionalPreferences: "",
      },
    },
  };
  const saved = await env.onboarding.saveProgress(userId, patch);
  await env.onboarding.savePrivateIdentity(userId, {
    fullName: `Secret ${telegramId}`, dateOfBirth: "1996-01-01",
    phoneNumber: `+2519${String(telegramId % 100000000n).padStart(8, "0").slice(0, 8)}`,
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

async function setup() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const onboarding = new OnboardingService(repository, cipher, true);
  const admin = new AdminService(repository, cipher);
  const discovery = new DiscoveryService(repository, cipher, true);
  const connections = new ConnectionService(repository, cipher, true);
  const requests = new RequestService(repository, cipher, true);
  return { repository, cipher, sessions, onboarding, admin, discovery, connections, requests };
}

async function swipeAndRequest(
  env: Awaited<ReturnType<typeof setup>>,
  sender: { userId: string; publicCode: string },
  target: { userId: string; publicCode: string },
  now = new Date(),
) {
  await env.discovery.recordDecision(sender.userId, {
    targetPublicCode: target.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
  }, now);
  return env.requests.sendRequest(sender.userId, {
    targetPublicCode: target.publicCode, idempotencyKey: crypto.randomUUID(),
  }, now);
}

describe("intentional introduction requests (Track D2)", () => {
  it("requires a target to be on the sender's shortlist first", async () => {
    const env = await setup();
    const man = await createCandidate(900000000000001n, "male", env);
    const woman = await createCandidate(900000000000002n, "female", env);
    // No prior swipe: the request is rejected (not from the shortlist).
    await expect(
      env.requests.sendRequest(man.userId, { targetPublicCode: woman.publicCode, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toThrow("NOT_SHORTLISTED");
  });

  it("enforces the 5 per rolling-24h cap and resets after the window", async () => {
    const env = await setup();
    const man = await createCandidate(900000000000011n, "male", env);
    // Six distinct women.
    const women = [];
    for (let i = 0; i < 6; i += 1) {
      women.push(await createCandidate(BigInt(900000000000020n + BigInt(i)), "female", env));
    }
    const t0 = new Date("2026-01-01T12:00:00.000Z");
    for (let i = 0; i < INTENTION_REQUEST_DAILY_CAP; i += 1) {
      const res = await swipeAndRequest(env, man, women[i]!, t0);
      expect(res.remainingToday).toBe(INTENTION_REQUEST_DAILY_CAP - (i + 1));
    }
    // The 6th within 24h is rate limited.
    await expect(swipeAndRequest(env, man, women[5]!, t0)).rejects.toThrow("INTENTION_RATE_LIMIT");

    // 25 hours later the window has rolled: a new request is allowed.
    const later = new Date(t0.getTime() + 25 * HOUR);
    const res = await swipeAndRequest(env, man, women[5]!, later);
    expect(res.status).toBe("pending");
    expect(res.remainingToday).toBe(INTENTION_REQUEST_DAILY_CAP - 1);
  });

  it("rejects a duplicate live request with REQUEST_ALREADY_EXISTS", async () => {
    const env = await setup();
    const man = await createCandidate(900000000000031n, "male", env);
    const woman = await createCandidate(900000000000032n, "female", env);
    await swipeAndRequest(env, man, woman);
    await expect(swipeAndRequest(env, man, woman)).rejects.toThrow("REQUEST_ALREADY_EXISTS");
  });

  it("surfaces a values-only summary to the recipient and hides a decline from the sender", async () => {
    const env = await setup();
    const man = await createCandidate(900000000000041n, "male", env);
    const woman = await createCandidate(900000000000042n, "female", env);
    await swipeAndRequest(env, man, woman);

    const incoming = incomingRequestsResponseSchema.parse(await env.requests.listIncoming(woman.userId));
    expect(incoming.requests).toHaveLength(1);
    const summary = incoming.requests[0]!;
    expect(summary.profile.publicCode).toBe(man.publicCode);
    expect(summary.profile.photoMode).toBe("values_only");
    // Shown strong basics include the new faith fields.
    expect(summary.profile.hasGodfather).toBe(true);
    expect(summary.profile.churchServiceActive).toBe(true);
    // No identity anywhere.
    const serialized = JSON.stringify(incoming);
    expect(serialized).not.toContain("Secret");
    expect(serialized).not.toMatch(/\+2519/);

    // The recipient declines.
    await env.requests.respond(woman.userId, summary.requestId, false);

    // The decline is invisible to the sender: outgoing still shows the request
    // as pending, and the sender never learns it was declined.
    const outgoing = outgoingRequestsResponseSchema.parse(await env.requests.listOutgoing(man.userId));
    expect(outgoing.requests).toHaveLength(1);
    expect(outgoing.requests[0]!.status).toBe("pending");
    expect(outgoing.dailyCap).toBe(INTENTION_REQUEST_DAILY_CAP);
  });

  it("accepting creates a connection that flows accept -> both confirm -> admin approve", async () => {
    const env = await setup();
    const man = await createCandidate(900000000000051n, "male", env);
    const woman = await createCandidate(900000000000052n, "female", env);
    await swipeAndRequest(env, man, woman);
    const incoming = await env.requests.listIncoming(woman.userId);
    const requestId = incoming.requests[0]!.requestId;

    const responded = await env.requests.respond(woman.userId, requestId, true);
    expect(responded.status).toBe("accepted");
    expect(responded.connectionId).not.toBeNull();

    // Once accepted the incoming request is no longer pending for the recipient.
    expect((await env.requests.listIncoming(woman.userId)).requests).toEqual([]);
    // The sender sees it as accepted.
    const outgoing = outgoingRequestsResponseSchema.parse(await env.requests.listOutgoing(man.userId));
    expect(outgoing.requests[0]!.status).toBe("accepted");

    const conn = responded.connectionId!;
    await env.connections.confirm(man.userId, conn, true);
    const afterWoman = await env.connections.confirm(woman.userId, conn, true);
    expect(afterWoman.status).toBe("mutual_confirmed_pending_admin");
    expect((await env.connections.listPending()).connections).toHaveLength(1);
    const approved = await env.connections.decide(conn, true);
    expect(approved.status).toBe("connected");
  });

  it("cannot respond to a foreign or already-responded request", async () => {
    const env = await setup();
    const man = await createCandidate(900000000000061n, "male", env);
    const woman = await createCandidate(900000000000062n, "female", env);
    const stranger = await createCandidate(900000000000063n, "female", env);
    await swipeAndRequest(env, man, woman);
    const requestId = (await env.requests.listIncoming(woman.userId)).requests[0]!.requestId;

    // A stranger (not the recipient) cannot respond.
    await expect(env.requests.respond(stranger.userId, requestId, true)).rejects.toThrow("REQUEST_NOT_FOUND");
    // The recipient responds once; a second response fails.
    await env.requests.respond(woman.userId, requestId, true);
    await expect(env.requests.respond(woman.userId, requestId, false)).rejects.toThrow("REQUEST_NOT_FOUND");
  });

  it("purges unanswered requests past 72h and connected-pair records", async () => {
    const env = await setup();
    const t0 = new Date("2026-02-01T12:00:00.000Z");
    const man = await createCandidate(900000000000071n, "male", env);
    const womanA = await createCandidate(900000000000072n, "female", env);
    const womanB = await createCandidate(900000000000073n, "female", env);

    // Request to A stays unanswered; request to B is accepted and fully connected.
    await swipeAndRequest(env, man, womanA, t0);
    await swipeAndRequest(env, man, womanB, t0);
    const reqB = (await env.requests.listIncoming(womanB.userId, t0)).requests[0]!;
    const connB = (await env.requests.respond(womanB.userId, reqB.requestId, true, t0)).connectionId!;
    await env.connections.confirm(man.userId, connB, true, t0);
    await env.connections.confirm(womanB.userId, connB, true, t0);
    await env.connections.decide(connB, true, t0);

    // Pair B's swipe + request records are minimized the moment it connects
    // (in decideConnection), so the connected-pair records are already gone.
    expect((await env.requests.listOutgoing(man.userId, t0)).requests).toHaveLength(1); // only A (pending)
    expect((await env.repository.countRequestsSince(man.userId, new Date(0)))).toBe(1);

    // Before 72h nothing is purged.
    const early = new Date(t0.getTime() + 71 * HOUR);
    const before = await env.repository.purgeExpiredIntroductionData(early);
    expect(before.expiredRequests).toBe(0);
    // The unanswered request to A is still live.
    expect((await env.requests.listIncoming(womanA.userId, early)).requests).toHaveLength(1);

    // After 72h the unanswered request to A expires and is purged.
    const after = new Date(t0.getTime() + 73 * HOUR);
    const purged = await env.repository.purgeExpiredIntroductionData(after);
    expect(purged.expiredRequests).toBe(1);
    expect((await env.requests.listIncoming(womanA.userId, after)).requests).toEqual([]);
  });
});
