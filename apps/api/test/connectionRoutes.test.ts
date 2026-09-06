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
    const adminSession = new AdminSessionService(sessionKey, "operator-password");
    const admin = new AdminService(repository, cipher);
    app = await buildApp({
      logger: false,
      sessionService: sessions,
      onboardingService: onboarding,
      discoveryService: discovery,
      connectionService: connections,
      adminSessionService: adminSession,
      adminService: admin,
    });
    return { app, sessions, onboarding, admin: adminSession, adminService: admin, discovery, connections };
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

  it("full HTTP lifecycle: mutual interest -> admin approve -> both confirm -> connected", async () => {
    const env = await build();
    const man = await approvedCandidate(env, 700000000000011n, "male");
    const woman = await approvedCandidate(env, 700000000000012n, "female");

    const interested = async (actor: { token: string; csrf: string }, targetCode: string) =>
      env.app.inject({
        method: "POST",
        url: "/v1/discovery/decision",
        headers: { ...SESSION_COOKIE(actor.token), "x-csrf-token": actor.csrf },
        payload: { targetPublicCode: targetCode, decision: "interested", idempotencyKey: randomUUID() },
      });
    expect((await interested(man, woman.publicCode)).statusCode).toBe(200);
    expect((await interested(woman, man.publicCode)).statusCode).toBe(200);

    // Users see nothing while the connection awaits admin approval.
    for (const actor of [man, woman]) {
      const res = await env.app.inject({ method: "GET", url: "/v1/connections", headers: SESSION_COOKIE(actor.token) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.connections).toEqual([]);
    }

    // Admin logs in and sees the pending pair.
    const login = await env.app.inject({
      method: "POST",
      url: "/v1/admin/session",
      payload: { password: "operator-password" },
    });
    expect(login.statusCode).toBe(200);
    const adminToken = login.cookies.find((c) => c.name === "kidan_admin_session")!.value;
    const adminCsrf = login.json().data.csrfToken;

    const pending = await env.app.inject({ method: "GET", url: "/v1/admin/connections", headers: ADMIN_COOKIE(adminToken) });
    expect(pending.statusCode).toBe(200);
    expect(pending.json().data.connections).toHaveLength(1);
    const connectionId = pending.json().data.connections[0].id;
    // No identity leaks in the admin payload either.
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
    expect(approve.json().data.status).toBe("admin_approved_pending_confirmation");

    // Both participants now see a values-only pending connection.
    const manList = connectionListResponseSchema.parse(
      (await env.app.inject({ method: "GET", url: "/v1/connections", headers: SESSION_COOKIE(man.token) })).json().data,
    );
    expect(manList.connections).toHaveLength(1);
    expect(manList.connections[0]!.other.publicCode).toBe(woman.publicCode);
    expect(manList.connections[0]!.other.gender).toBe("female");

    const confirm = async (actor: { token: string; csrf: string }) =>
      env.app.inject({
        method: "POST",
        url: `/v1/connections/${connectionId}/confirm`,
        headers: { ...SESSION_COOKIE(actor.token), "x-csrf-token": actor.csrf },
        payload: { confirm: true },
      });
    expect((await confirm(man)).json().data.status).toBe("admin_approved_pending_confirmation");
    expect((await confirm(woman)).json().data.status).toBe("connected");

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
