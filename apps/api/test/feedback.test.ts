import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { AdminSessionService } from "../src/auth/adminSessionService.js";
import { AdminService } from "../src/admin/adminService.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { FeedbackService } from "../src/feedback/feedbackService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const ADMIN_PASSWORD = "operator-pilot-secret";

async function buildApp_() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const onboarding = new OnboardingService(repository, cipher, true);
  const feedback = new FeedbackService(repository);
  const adminSession = new AdminSessionService(randomBytes(32), ADMIN_PASSWORD);
  const adminService = new AdminService(repository, cipher);

  const issued = await sessions.issueForTelegramUser(9007199254740099n, new Date("2026-08-01T10:00:00Z"));
  const session = await sessions.authenticate(issued.sessionToken);
  const publicCode = session!.user.publicCode;

  const app = await buildApp({
    logger: false,
    sessionService: sessions,
    onboardingService: onboarding,
    feedbackService: feedback,
    adminSessionService: adminSession,
    adminService,
  });
  return { app, token: issued.sessionToken, csrf: issued.csrfToken, publicCode };
}

async function adminLogin(app: FastifyInstance) {
  const res = await app.inject({ method: "POST", url: "/v1/admin/session", payload: { password: ADMIN_PASSWORD } });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers["set-cookie"] as unknown as string | string[];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(";")[0]!;
  const body = (res.json() as { data: { csrfToken: string } }).data;
  return { cookie, csrf: body.csrfToken };
}

describe("feedback routes", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("rejects feedback without a session (401)", async () => {
    ({ app } = await buildApp_());
    const res = await app.inject({ method: "POST", url: "/v1/feedback", payload: { kind: "feedback", body: "Hi" } });
    expect(res.statusCode).toBe(401);
  });

  it("requires a CSRF token to submit feedback", async () => {
    const ctx = await buildApp_();
    app = ctx.app;
    const noCsrf = await app.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: { cookie: `kidan_session=${ctx.token}` },
      payload: { kind: "feedback", body: "Hello" },
    });
    expect(noCsrf.statusCode).toBe(403);
  });

  it("submits feedback and lists it for the admin, then marks it read", async () => {
    const ctx = await buildApp_();
    app = ctx.app;
    const submit = await app.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: { cookie: `kidan_session=${ctx.token}`, "x-csrf-token": ctx.csrf },
      payload: { kind: "report", body: "I had a problem with the photo upload." },
    });
    expect(submit.statusCode).toBe(201);
    const submitBody = submit.json() as { data: { id: string } };
    const id = submitBody.data.id;

    // Admin: not logged in -> 401.
    const unauth = await app.inject({ method: "GET", url: "/v1/admin/feedback" });
    expect(unauth.statusCode).toBe(401);

    const { cookie } = await adminLogin(app);
    const list = await app.inject({
      method: "GET",
      url: "/v1/admin/feedback",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { data: { items: { id: string; publicCode: string; kind: string; body: string }[]; unreadCount: number } };
    expect(listBody.data.items).toHaveLength(1);
    expect(listBody.data.items[0]!.body).toBe("I had a problem with the photo upload.");
    expect(listBody.data.items[0]!.publicCode).toBe(ctx.publicCode);
    expect(listBody.data.unreadCount).toBe(1);

    const markRead = await app.inject({
      method: "POST",
      url: `/v1/admin/feedback/${id}/read`,
      headers: { cookie },
    });
    expect(markRead.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: "/v1/admin/feedback", headers: { cookie } });
    const afterBody = after.json() as { data: { unreadCount: number } };
    expect(afterBody.data.unreadCount).toBe(0);
  });

  it("rejects an empty feedback body", async () => {
    const ctx = await buildApp_();
    app = ctx.app;
    const res = await app.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: { cookie: `kidan_session=${ctx.token}`, "x-csrf-token": ctx.csrf },
      payload: { kind: "feedback", body: "   " },
    });
    // Whitespace-only body fails the schema's trim().min(1) -> 400.
    expect(res.statusCode).toBe(400);
  });
});
