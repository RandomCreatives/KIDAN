import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  consentDraftSchema,
  connectionListResponseSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";
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

async function createCandidate(
  telegramId: bigint,
  gender: "female" | "male",
  env: Awaited<ReturnType<typeof setup>>,
  approved = true,
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
        bio: "Connection service test bio long enough to satisfy the minimum bio length validation.",
          hasGodfather: true,
    isDeacon: false,
    churchServiceActive: true,
    hasDisability: false,
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
  if (approved) await env.admin.decide(user.publicCode, { decision: "approved" });
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

/**
 * Track D2 funnel: man shortlists (swipes right) the woman, sends a formal
 * introduction request, and the woman accepts. Returns the resulting
 * connection id (in 'request_accepted_pending_confirmation').
 */
async function acceptedRequest(
  env: Awaited<ReturnType<typeof setup>>,
  man: { userId: string; publicCode: string },
  woman: { userId: string; publicCode: string },
): Promise<{ requestId: string; connectionId: string }> {
  await env.discovery.recordDecision(man.userId, {
    targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
  });
  const created = await env.requests.sendRequest(man.userId, {
    targetPublicCode: woman.publicCode, idempotencyKey: crypto.randomUUID(),
  });
  const incoming = await env.requests.listIncoming(woman.userId);
  const requestId = incoming.requests[0]!.requestId;
  expect(requestId).toBe(created.requestId);
  const responded = await env.requests.respond(woman.userId, requestId, true);
  expect(responded.status).toBe("accepted");
  return { requestId, connectionId: responded.connectionId! };
}

describe("admin-gated connections (Track D)", () => {
  it("returns no connections when submissions are disabled", async () => {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const connections = new ConnectionService(repository, cipher, false);
    expect((await connections.listForUser("u1")).connections).toEqual([]);
    await expect(connections.confirm("u1", "00000000-0000-4000-8000-000000000001", true)).rejects.toThrow("REAL_SUBMISSIONS_DISABLED");
  });

  it("hides one-sided interest and shows nothing while awaiting admin approval", async () => {
    const env = await setup();
    const man = await createCandidate(800000000000001n, "male", env);
    const woman = await createCandidate(800000000000002n, "female", env);
    await env.discovery.recordDecision(man.userId, {
      targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
    });
    // Only the man expressed interest: nothing visible to either side.
    expect((await env.connections.listForUser(man.userId)).connections).toEqual([]);
    expect((await env.connections.listForUser(woman.userId)).connections).toEqual([]);
    // Admin queue is empty until the interest is mutual.
    expect((await env.connections.listPending()).connections).toEqual([]);
  });

  it("mutual swiping alone creates no admin item and no connection (Track D2)", async () => {
    const env = await setup();
    const man = await createCandidate(800000000000011n, "male", env);
    const woman = await createCandidate(800000000000012n, "female", env);
    await env.discovery.recordDecision(man.userId, {
      targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
    });
    await env.discovery.recordDecision(woman.userId, {
      targetPublicCode: man.publicCode, decision: "interested", idempotencyKey: crypto.randomUUID(),
    });
    // A swipe (even mutual) is a private shortlist entry only: no admin queue
    // item and no connection is created.
    expect((await env.connections.listPending()).connections).toEqual([]);
    expect((await env.connections.listForUser(man.userId)).connections).toEqual([]);
    expect((await env.connections.listForUser(woman.userId)).connections).toEqual([]);
  });

  it("an accepted request creates a connection hidden from the admin queue until both confirm", async () => {
    const env = await setup();
    const man = await createCandidate(800000000000013n, "male", env);
    const woman = await createCandidate(800000000000014n, "female", env);
    const { connectionId } = await acceptedRequest(env, man, woman);

    // The pair now sees a connection awaiting THEIR confirmation.
    const manList = connectionListResponseSchema.parse(await env.connections.listForUser(man.userId));
    const womanList = connectionListResponseSchema.parse(await env.connections.listForUser(woman.userId));
    expect(manList.connections).toHaveLength(1);
    expect(womanList.connections).toHaveLength(1);
    const manView = manList.connections[0]!;
    expect(manView.id).toBe(connectionId);
    expect(manView.status).toBe("request_accepted_pending_confirmation");
    expect(manView.other.publicCode).toBe(woman.publicCode);
    expect(manView.other.gender).toBe("female");
    const serialized = JSON.stringify(manList);
    expect(serialized).not.toContain("Secret");
    expect(serialized).not.toContain("+2519");

    // The administrator sees nothing until BOTH participants confirm.
    expect((await env.connections.listPending()).connections).toEqual([]);
  });

  it("full lifecycle: request accepted -> both confirm -> admin approves -> connected", async () => {
    const env = await setup();
    const man = await createCandidate(800000000000021n, "male", env);
    const woman = await createCandidate(800000000000022n, "female", env);
    const { connectionId: pair } = await acceptedRequest(env, man, woman);

    // Man confirms first: still awaiting the woman; admin queue stays empty.
    const afterMan = await env.connections.confirm(man.userId, pair, true);
    expect(afterMan.status).toBe("request_accepted_pending_confirmation");
    const manView2 = (await env.connections.listForUser(man.userId)).connections[0]!;
    expect(manView2.iConfirmed).toBe(true);
    expect(manView2.theyConfirmed).toBe(false);
    const womanView2 = (await env.connections.listForUser(woman.userId)).connections[0]!;
    expect(womanView2.iConfirmed).toBe(false);
    expect(womanView2.theyConfirmed).toBe(true);
    expect((await env.connections.listPending()).connections).toEqual([]);

    // Woman confirms: the pair moves to the admin queue (hidden from users).
    const afterWoman = await env.connections.confirm(woman.userId, pair, true);
    expect(afterWoman.status).toBe("mutual_confirmed_pending_admin");
    // While awaiting the administrator, participants no longer see the pair.
    expect((await env.connections.listForUser(man.userId)).connections).toEqual([]);
    expect((await env.connections.listForUser(woman.userId)).connections).toEqual([]);

    const pending = await env.connections.listPending();
    expect(pending.connections).toHaveLength(1);
    const queued = pending.connections[0]!;
    expect(queued.id).toBe(pair);
    expect(queued.userA.publicCode).toMatch(/^KD-/);
    expect(queued.userB.publicCode).toMatch(/^KD-/);
    const queuedJson = JSON.stringify(queued);
    expect(queuedJson).not.toContain("Secret");
    expect(queuedJson).not.toContain("+2519");

    // Administrator acts LAST: approval opens the restricted introduction.
    const approved = await env.connections.decide(pair, true);
    expect(approved.status).toBe("connected");
    expect((await env.connections.listPending()).connections).toEqual([]);
    const finalMan = (await env.connections.listForUser(man.userId)).connections[0]!;
    expect(finalMan.status).toBe("connected");
    expect(finalMan.iConfirmed).toBe(true);
    expect(finalMan.theyConfirmed).toBe(true);
  });

  it("a decline during the post-accept confirmation closes the connection", async () => {
    const env = await setup();
    const man = await createCandidate(800000000000031n, "male", env);
    const woman = await createCandidate(800000000000032n, "female", env);
    const { connectionId: pair } = await acceptedRequest(env, man, woman);
    const declined = await env.connections.confirm(woman.userId, pair, false);
    expect(declined.status).toBe("declined");
    expect((await env.connections.listForUser(man.userId)).connections[0]!.status).toBe("declined");
    // Nothing ever reached the admin queue.
    expect((await env.connections.listPending()).connections).toEqual([]);
  });

  it("admin rejection of a mutually-confirmed pair marks it rejected and hides it", async () => {
    const env = await setup();
    const man = await createCandidate(800000000000041n, "male", env);
    const woman = await createCandidate(800000000000042n, "female", env);
    const { connectionId: pair } = await acceptedRequest(env, man, woman);
    await env.connections.confirm(man.userId, pair, true);
    await env.connections.confirm(woman.userId, pair, true);
    expect((await env.connections.listPending()).connections).toHaveLength(1);
    const rejected = await env.connections.decide(pair, false);
    expect(rejected.status).toBe("admin_rejected");
    // Rejected connections are never shown to participants.
    expect((await env.connections.listForUser(man.userId)).connections).toEqual([]);
    expect((await env.connections.listForUser(woman.userId)).connections).toEqual([]);
  });

  it("rejects confirmation of an unknown or foreign connection", async () => {
    const env = await setup();
    const man = await createCandidate(800000000000051n, "male", env);
    const stranger = await createCandidate(800000000000053n, "male", env);
    const woman = await createCandidate(800000000000052n, "female", env);
    const { connectionId: pair } = await acceptedRequest(env, man, woman);
    // A user who is not part of the connection cannot confirm it.
    await expect(env.connections.confirm(stranger.userId, pair, true)).rejects.toThrow("CONNECTION_NOT_FOUND");
    // Unknown connection id.
    await expect(env.connections.confirm(man.userId, "00000000-0000-4000-8000-000000000099", true)).rejects.toThrow("CONNECTION_NOT_FOUND");
  });

  describe("restricted in-app introduction (D3)", () => {
    type SetupEnv = Awaited<ReturnType<typeof setup>>;
    type Candidate = Awaited<ReturnType<typeof createCandidate>>;
    async function connectPair(manId: bigint, womanId: bigint): Promise<{ env: SetupEnv; man: Candidate; woman: Candidate; connectionId: string }> {
      const env = await setup();
      const man = await createCandidate(manId, "male", env);
      const woman = await createCandidate(womanId, "female", env);
      const { connectionId: pair } = await acceptedRequest(env, man, woman);
      // Both participants confirm, then the administrator approves (admin last).
      await env.connections.confirm(man.userId, pair, true);
      await env.connections.confirm(woman.userId, pair, true);
      await env.connections.decide(pair, true);
      return { env, man, woman, connectionId: pair };
    }

    it("refuses the thread before the connection is connected", async () => {
      const env = await setup();
      const man = await createCandidate(800000000000071n, "male", env);
      const woman = await createCandidate(800000000000072n, "female", env);
      const { connectionId: pair } = await acceptedRequest(env, man, woman);
      // Accepted but not yet confirmed/approved: the thread is not open.
      await expect(env.connections.getThread(man.userId, pair)).rejects.toThrow("INTRODUCTION_NOT_OPEN");
    });

    it("opens a values-only thread for a connected pair and routes fromMe correctly", async () => {
      const { env, man, woman, connectionId } = await connectPair(800000000000061n, 800000000000062n);
      const saved = await env.connections.postMessage(man.userId, connectionId, {
        body: "Selam, praying your fasts are accepted.",
      });
      const manView = await env.connections.getThread(man.userId, connectionId);
      const womanView = await env.connections.getThread(woman.userId, connectionId);
      expect(manView.other.publicCode).toBe(woman.publicCode);
      expect(womanView.other.publicCode).toBe(man.publicCode);
      expect(manView.messages[0]!.fromMe).toBe(true);
      expect(womanView.messages[0]!.fromMe).toBe(false);
      expect(saved.id).toBe(manView.messages[0]!.id);
    });

    it("rejects messages containing phone numbers, handles, links, or contact details", async () => {
      const { env, man, woman, connectionId: pair } = await connectPair(800000000000081n, 800000000000082n);
      const blocked = [
        "Call me at 0911 22 33 44",
        "My telegram is @some_handle",
        "reach me at t.me/someone",
        "see https://example.com/x",
        "my number +251911223344 thanks",
      ];
      for (const body of blocked) {
        await expect(
          env.connections.postMessage(man.userId, pair, { body }),
        ).rejects.toThrow(/CONTACT_NOT_ALLOWED|LINKS_NOT_ALLOWED/);
      }
      // A values-only greeting is accepted and never contains identity.
      const saved = await env.connections.postMessage(man.userId, pair, {
        body: "Selam! I was glad to be introduced. May your fasts and prayers be accepted.",
      });
      expect(saved.fromMe).toBe(true);
      expect(saved.hidden).toBe(false);

      const thread = await env.connections.getThread(woman.userId, pair);
      expect(thread.messages).toHaveLength(1);
      expect(thread.messages[0]!.fromMe).toBe(false);
      // The other party's profile stays values-only.
      expect(thread.other.publicCode).toBe(man.publicCode);
      expect(thread.other.photoMode).toBe("values_only");
      const serialized = JSON.stringify(thread);
      expect(serialized).not.toContain("Secret");
      expect(serialized).not.toMatch(/\+2519/);
      expect(serialized).not.toContain("@some_handle");
    });

    it("lets an administrator hide a message, which blanks it for both users", async () => {
      const { env, man, woman, connectionId: pair } = await connectPair(800000000000091n, 800000000000092n);
      const message = await env.connections.postMessage(man.userId, pair, { body: "A borderline message the admin removes." });

      const recent = await env.connections.listRecentMessages();
      expect(recent.messages.some((m) => m.id === message.id)).toBe(true);

      await env.connections.hideMessage(message.id);
      const thread = await env.connections.getThread(woman.userId, pair);
      const shown = thread.messages.find((m) => m.id === message.id)!;
      expect(shown.hidden).toBe(true);
      expect(shown.body).toBe("");
    });
  });
});
