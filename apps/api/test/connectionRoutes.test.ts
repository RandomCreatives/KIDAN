import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  consentDraftSchema,
  connectionListResponseSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { AdminSessionService } from "../src/auth/adminSessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { AdminService } from "../src/admin/adminService.js";
import { DiscoveryService } from "../src/discovery/discoveryService.js";
import { ConnectionService } from "../src/connections/connectionService.js";
import { RequestService } from "../src/requests/requestService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

type ValueTag = z.infer<typeof valueTagSchema>;
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;

describe("connection routes", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  async function build() {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessionKey = randomBytes(32);
    const sessions = new SessionService(repository, cipher, new SecretHasher(sessionKey));
    const onboarding = new OnboardingService(repository, cipher, true);
    const discovery = new DiscoveryService(repository, cipher, true);
    const connections = new ConnectionService(repository, cipher, true);
    const requests = new RequestService(repository, cipher, true);
    const adminSession = new AdminSessionService(sessionKey, "operator-password");
    const admin = new AdminService(repository, cipher);
    app = await buildApp({
      logger: false,
      sessionService: sessions,
      onboardingService: onboarding,
      discoveryService: discovery,
      connectionService: connections,
      requestService: requests,
      adminSessionService: adminSession,
      adminService: admin,
    });
    return { app, sessions, onboarding, admin: adminSession, adminService: admin, discovery, connections, requests };
  }

  type Env = Awaited<ReturnType<typeof build>>;

  async function approvedCandidate(
    env: Env,
    telegramId: bigint,
    gender: "female" | "male",
  ) {
    const issued = await env.sessions.issueForTelegramUser(telegramId, new Date());
    const session = (await env.sessions.authenticate(issued.sessionToken))!;
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
          bio: "Route test bio long enough to satisfy the minimum bio length validation rule here.",
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
    const saved = await env.onboarding.saveProgress(session.user.id, patch);
    await env.onboarding.savePrivateIdentity(session.user.id, {
      fullName: `Secret Route ${telegramId}`, dateOfBirth: "1996-01-01",
      phoneNumber: `+2519${String(telegramId % 100000000n).padStart(8, "0").slice(0, 8)}`,
      verificationPhotoStatus: "pending_upload",
    });
    await env.onboarding.saveVerificationPhoto(session.user.id, { dataUrl: JPEG });
    await env.onboarding.submit(session.user.id, {
      expectedVersion: saved.version,
      consent: consentDraftSchema.parse({
        informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
        discoveryPublication: true, verificationPhotoRetention: true, communityRules: true, botNotifications: false,
      }),
    });
    const user = (await env.sessions.authenticate(issued.sessionToken))!.user;
    await env.adminService.decide(user.publicCode, { decision: "approved" });
    return { token: issued.sessionToken, csrf: issued.csrfToken, userId: user.id, publicCode: user.publicCode };
  }

  const SESSION_COOKIE = (token: string) => ({ cookie: `kidan_session=${token}` });
  const ADMIN_COOKIE = (token: string) => ({ cookie: `kidan_admin_session=${token}` });

  it("requires a session to list connections", async () => {
    const env = await build();
    const res = await env.app.inject({ method: "GET", url: "/v1/connections" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a confirmation without CSRF", async () => {
    const env = await build();
    const man = await approvedCandidate(env, 700000000000001n, "male");
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/connections/${randomUUID()}/confirm`,
      headers: SESSION_COOKIE(man.token),
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("INVALID_CSRF");
  });

  it("404s confirming an unknown connection", async () => {
    const env = await build();
    const man = await approvedCandidate(env, 700000000000002n, "male");
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/connections/${randomUUID()}/confirm`,
      headers: { ...SESSION_COOKIE(man.token), "x-csrf-token": man.csrf },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("CONNECTION_NOT_FOUND");
  });

  it("admin endpoints require an admin session", async () => {
    const env = await build();
    const list = await env.app.inject({ method: "GET", url: "/v1/admin/connections" });
    expect(list.statusCode).toBe(401);
    const decide = await env.app.inject({
      method: "POST",
      url: `/v1/admin/connections/${randomUUID()}/decision`,
      payload: { decision: "approved" },
    });
    expect(decide.statusCode).toBe(401);
  });

  it("full HTTP lifecycle: request accepted -> both confirm -> admin approves -> connected", async () => {
    const env = await build();
    const man = await approvedCandidate(env, 700000000000011n, "male");
    const woman = await approvedCandidate(env, 700000000000012n, "female");

    // The man right-swipes (private shortlist) then sends a formal request.
    const swipe = await env.app.inject({
      method: "POST",
      url: "/v1/discovery/decision",
      headers: { ...SESSION_COOKIE(man.token), "x-csrf-token": man.csrf },
      payload: { targetPublicCode: woman.publicCode, decision: "interested", idempotencyKey: randomUUID() },
    });
    expect(swipe.statusCode).toBe(200);

    const request = await env.app.inject({
      method: "POST",
      url: "/v1/discovery/request",
      headers: { ...SESSION_COOKIE(man.token), "x-csrf-token": man.csrf },
      payload: { targetPublicCode: woman.publicCode, idempotencyKey: randomUUID() },
    });
    expect(request.statusCode).toBe(200);
    expect(request.json().data.dailyCap).toBe(5);

    // The woman sees the incoming request with a values-only summary.
    const incoming = await env.app.inject({
      method: "GET",
      url: "/v1/requests/incoming",
      headers: SESSION_COOKIE(woman.token),
    });
    expect(incoming.statusCode).toBe(200);
    expect(incoming.json().data.requests).toHaveLength(1);
    const incomingItem = incoming.json().data.requests[0];
    expect(incomingItem.profile.publicCode).toBe(man.publicCode);
    expect(incomingItem.profile.photoMode).toBe("values_only");
    expect(JSON.stringify(incoming.json())).not.toContain("Secret Route");
    expect(JSON.stringify(incoming.json())).not.toMatch(/\+2519/);
    const requestId = incomingItem.requestId;

    // The woman accepts.
    const respond = await env.app.inject({
      method: "POST",
      url: `/v1/requests/${requestId}/respond`,
      headers: { ...SESSION_COOKIE(woman.token), "x-csrf-token": woman.csrf },
      payload: { accept: true },
    });
    expect(respond.statusCode).toBe(200);
    expect(respond.json().data.status).toBe("accepted");
    const connectionId = respond.json().data.connectionId;
    expect(connectionId).toBeTruthy();

    // Both participants now see a values-only connection awaiting THEIR confirmation.
    for (const actor of [man, woman]) {
      const res = await env.app.inject({ method: "GET", url: "/v1/connections", headers: SESSION_COOKIE(actor.token) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.connections).toHaveLength(1);
    }
    const manList = connectionListResponseSchema.parse(
      (await env.app.inject({ method: "GET", url: "/v1/connections", headers: SESSION_COOKIE(man.token) })).json().data,
    );
    expect(manList.connections[0]!.other.publicCode).toBe(woman.publicCode);
    expect(manList.connections[0]!.other.gender).toBe("female");
    expect(manList.connections[0]!.status).toBe("request_accepted_pending_confirmation");

    // The administrator sees nothing until BOTH participants confirm.
    const login = await env.app.inject({
      method: "POST",
      url: "/v1/admin/session",
      payload: { password: "operator-password" },
    });
    expect(login.statusCode).toBe(200);
    const adminToken = login.cookies.find((c) => c.name === "kidan_admin_session")!.value;
    const adminCsrf = login.json().data.csrfToken;
    const emptyQueue = await env.app.inject({ method: "GET", url: "/v1/admin/connections", headers: ADMIN_COOKIE(adminToken) });
    expect(emptyQueue.json().data.connections).toEqual([]);

    const confirm = async (actor: { token: string; csrf: string }) =>
      env.app.inject({
        method: "POST",
        url: `/v1/connections/${connectionId}/confirm`,
        headers: { ...SESSION_COOKIE(actor.token), "x-csrf-token": actor.csrf },
        payload: { confirm: true },
      });
    expect((await confirm(man)).json().data.status).toBe("request_accepted_pending_confirmation");
    // After both confirm the pair enters the admin queue (hidden from users).
    expect((await confirm(woman)).json().data.status).toBe("mutual_confirmed_pending_admin");

    // The administrator now sees the mutually-confirmed pair.
    const pending = await env.app.inject({ method: "GET", url: "/v1/admin/connections", headers: ADMIN_COOKIE(adminToken) });
    expect(pending.statusCode).toBe(200);
    expect(pending.json().data.connections).toHaveLength(1);
    expect(pending.json().data.connections[0].id).toBe(connectionId);
    expect(JSON.stringify(pending.json())).not.toContain("Secret Route");
    expect(JSON.stringify(pending.json())).not.toContain("+2519");

    // Admin approval requires CSRF.
    const noCsrf = await env.app.inject({
      method: "POST",
      url: `/v1/admin/connections/${connectionId}/decision`,
      headers: ADMIN_COOKIE(adminToken),
      payload: { decision: "approved" },
    });
    expect(noCsrf.statusCode).toBe(403);

    const approve = await env.app.inject({
      method: "POST",
      url: `/v1/admin/connections/${connectionId}/decision`,
      headers: { ...ADMIN_COOKIE(adminToken), "x-csrf-token": adminCsrf },
      payload: { decision: "approved" },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.status).toBe("connected");

    const finalList = (await env.app.inject({ method: "GET", url: "/v1/connections", headers: SESSION_COOKIE(man.token) })).json().data;
    expect(finalList.connections[0].status).toBe("connected");
    expect(finalList.connections[0].iConfirmed).toBe(true);
    expect(finalList.connections[0].theyConfirmed).toBe(true);

    // --- Restricted in-app introduction (D3) ---
    // The thread 404s for a stranger and requires CSRF to post.
    const stranger = await approvedCandidate(env, 700000000000099n, "male");
    const foreign = await env.app.inject({
      method: "GET",
      url: `/v1/connections/${connectionId}/introduction`,
      headers: SESSION_COOKIE(stranger.token),
    });
    expect(foreign.statusCode).toBe(404);

    const postNoCsrf = await env.app.inject({
      method: "POST",
      url: `/v1/connections/${connectionId}/introduction`,
      headers: SESSION_COOKIE(man.token),
      payload: { body: "Selam" },
    });
    expect(postNoCsrf.statusCode).toBe(403);

    // A contact-detail message is rejected with 422.
    const blockedPost = await env.app.inject({
      method: "POST",
      url: `/v1/connections/${connectionId}/introduction`,
      headers: { ...SESSION_COOKIE(man.token), "x-csrf-token": man.csrf },
      payload: { body: "reach me on t.me/someone or +251911223344" },
    });
    expect(blockedPost.statusCode).toBe(422);
    expect(["CONTACT_NOT_ALLOWED", "LINKS_NOT_ALLOWED"]).toContain(blockedPost.json().error.code);

    // A values-only greeting is accepted; the thread returns values-only data.
    const greeting = await env.app.inject({
      method: "POST",
      url: `/v1/connections/${connectionId}/introduction`,
      headers: { ...SESSION_COOKIE(man.token), "x-csrf-token": man.csrf },
      payload: { body: "Selam! Praying your fasts are accepted." },
    });
    expect(greeting.statusCode).toBe(200);
    expect(greeting.json().data.message.fromMe).toBe(true);

    const thread = (
      await env.app.inject({
        method: "GET",
        url: `/v1/connections/${connectionId}/introduction`,
        headers: SESSION_COOKIE(woman.token),
      })
    ).json().data;
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].fromMe).toBe(false);
    expect(thread.other.publicCode).toBe(man.publicCode);
    expect(thread.other.photoMode).toBe("values_only");
    expect(JSON.stringify(thread)).not.toContain("Secret Route");
    expect(JSON.stringify(thread)).not.toMatch(/\+2519/);

    // Admin moderation: the message appears in the admin list and can be hidden.
    const adminList = await env.app.inject({
      method: "GET",
      url: "/v1/admin/introductions",
      headers: ADMIN_COOKIE(adminToken),
    });
    expect(adminList.statusCode).toBe(200);
    const messageId = adminList.json().data.messages[0].id;
    const hide = await env.app.inject({
      method: "POST",
      url: `/v1/admin/introductions/${messageId}/hide`,
      headers: { ...ADMIN_COOKIE(adminToken), "x-csrf-token": adminCsrf },
    });
    expect(hide.statusCode).toBe(200);
    const afterHideRes = await env.app.inject({
      method: "GET",
      url: `/v1/connections/${connectionId}/introduction`,
      headers: SESSION_COOKIE(woman.token),
    });
    expect(afterHideRes.statusCode).toBe(200);
    const afterHide = afterHideRes.json().data;
    expect(afterHide.messages[0].hidden).toBe(true);
    expect(afterHide.messages[0].body).toBe("");
  });
});
