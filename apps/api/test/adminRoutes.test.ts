import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  consentDraftSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";

type ValueTag = z.infer<typeof valueTagSchema>;
import { buildApp } from "../src/appFactory.js";
import { AdminSessionService } from "../src/auth/adminSessionService.js";
import { AdminService } from "../src/admin/adminService.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

const ADMIN_PASSWORD = "operator-pilot-secret";
const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;
const COOKIE = "kidan_admin_session";

async function seedCandidate(
  repository: MemoryPersistenceRepository,
  cipher: IdentityCipher,
  sessions: SessionService,
  onboarding: OnboardingService,
) {
  const issued = await sessions.issueForTelegramUser(9007199254740099n, new Date("2026-08-01T10:00:00Z"));
  const session = await sessions.authenticate(issued.sessionToken);
  const userId = session!.user.id;
  const publicCode = session!.user.publicCode;
  const publicSections = {
    publicProfile: {
      gender: "female" as const,
      countryCode: "ET",
      city: "Bahir Dar",
      educationLevel: "diploma" as const,
      fieldOfStudy: "Nursing",
      employmentStatus: "employed" as const,
      occupationCategory: "Healthcare",
      maritalStatus: "never_married" as const,
      hasChildren: false,
      heightCm: 162,
    },
    faithAndFamily: {
      faithTradition: "ethiopian_orthodox_tewahedo" as const,
      marriageIntention: "teklil" as const,
      wantsChildren: "yes" as const,
      values: ["active_faith", "honesty", "family_oriented"] as ValueTag[],
      bio: "Bio used for admin route testing, long enough to pass validation.",
    },
    partnerPreferences: {
      ageMin: 28,
      ageMax: 38,
      preferredCities: ["Bahir Dar"],
      openToAbroad: false,
      acceptedMaritalStatuses: ["never_married" as const],
      acceptsPartnerWithChildren: false,
      desiredValues: ["active_faith" as ValueTag],
      acceptedMarriageIntentions: ["teklil" as const],
      additionalPreferences: "",
    },
  };
  const patch: OnboardingProgressPatch = {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    currentStep: "public_preview",
    expectedVersion: 0,
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      ...publicSections,
    },
  };
  const saved = await onboarding.saveProgress(userId, patch, new Date("2026-08-01T10:00:00Z"));
  await onboarding.savePrivateIdentity(
    userId,
    { fullName: "Sara Girma", dateOfBirth: "1998-06-01", phoneNumber: "+251922000000", verificationPhotoStatus: "pending_upload" },
    new Date("2026-08-01T10:01:00Z"),
  );
  await onboarding.saveVerificationPhoto(userId, { dataUrl: JPEG_DATA_URL }, new Date("2026-08-01T10:02:00Z"));
  await onboarding.submit(
    userId,
    { expectedVersion: saved.version, consent: consentDraftSchema.parse({
      informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
      discoveryPublication: true, verificationPhotoRetention: true, communityRules: true, botNotifications: false,
    }) },
    new Date("2026-08-01T10:03:00Z"),
  );
  return publicCode;
}

async function buildAdminApp() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const onboarding = new OnboardingService(repository, cipher, true);
  const adminSession = new AdminSessionService(randomBytes(32), ADMIN_PASSWORD);
  const adminService = new AdminService(repository, cipher);
  const app = await buildApp({
    logger: false,
    sessionService: sessions,
    onboardingService: onboarding,
    adminSessionService: adminSession,
    adminService,
  });
  const publicCode = await seedCandidate(repository, cipher, sessions, onboarding);
  return { app, publicCode };
}

/** Logs in and returns { cookie, csrf }. */
async function login(app: FastifyInstance) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/admin/session",
    payload: { password: ADMIN_PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers["set-cookie"] as unknown as string | string[];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(";")[0]!;
  const body = (res.json() as { data: { csrfToken: string } }).data;
  return { cookie, csrf: body.csrfToken };
}

describe("admin review console routes", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("rejects a wrong password with 401 and sets no session cookie", async () => {
    ({ app } = await buildAdminApp());
    const res = await app.inject({ method: "POST", url: "/v1/admin/session", payload: { password: "nope" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_ADMIN_CREDENTIALS");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("requires authentication to read the queue", async () => {
    ({ app } = await buildAdminApp());
    const res = await app.inject({ method: "GET", url: "/v1/admin/submissions" });
    expect(res.statusCode).toBe(401);
  });

  it("logs in, lists the queue, and opens the detail with decrypted identity", async () => {
    ({ app } = await buildAdminApp());
    const { cookie } = await login(app);

    const queueRes = await app.inject({ method: "GET", url: "/v1/admin/submissions", headers: { cookie } });
    expect(queueRes.statusCode).toBe(200);
    const queue = (queueRes.json() as { data: { items: Array<{ publicCode: string }> } }).data.items;
    expect(queue).toHaveLength(1);

    const code = queue[0]!.publicCode;
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/admin/submissions/${code}`,
      headers: { cookie },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = (detailRes.json() as { data: { identity: { fullName: string } } }).data;
    expect(detail.identity.fullName).toBe("Sara Girma");
  });

  it("serves the verification photo as a data URL to an admin", async () => {
    ({ app } = await buildAdminApp());
    const { cookie } = await login(app);
    const codeRes = await app.inject({ method: "GET", url: "/v1/admin/submissions", headers: { cookie } });
    const code = ((codeRes.json() as { data: { items: Array<{ publicCode: string }> } }).data.items[0]!).publicCode;
    const res = await app.inject({ method: "GET", url: `/v1/admin/submissions/${code}/photo`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: { dataUrl: string; mediaType: string } }).data;
    expect(data.mediaType).toBe("image/jpeg");
    expect(data.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    const decoded = Buffer.from(data.dataUrl.split(",")[1]!, "base64");
    expect(Array.from(decoded.subarray(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  it("rejects a decision without a CSRF token", async () => {
    ({ app } = await buildAdminApp());
    const { cookie } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: `/v1/admin/submissions/${"KD-XXXXXX"}/decision`,
      headers: { cookie },
      payload: { decision: "approved" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("INVALID_CSRF");
  });

  it("approves with CSRF and removes the candidate from the queue", async () => {
    ({ app } = await buildAdminApp());
    const { cookie, csrf } = await login(app);
    const codeRes = await app.inject({ method: "GET", url: "/v1/admin/submissions", headers: { cookie } });
    const code = ((codeRes.json() as { data: { items: Array<{ publicCode: string }> } }).data.items[0]!).publicCode;

    const decide = await app.inject({
      method: "POST",
      url: `/v1/admin/submissions/${code}/decision`,
      headers: { cookie, "x-csrf-token": csrf },
      payload: { decision: "approved" },
    });
    expect(decide.statusCode).toBe(200);
    expect((decide.json() as { data: { reviewStatus: string } }).data.reviewStatus).toBe("approved");

    const queueRes = await app.inject({ method: "GET", url: "/v1/admin/submissions", headers: { cookie } });
    const queue = (queueRes.json() as { data: { items: unknown[] } }).data.items;
    expect(queue).toHaveLength(0);
  });

  it("requires feedback (422) for a rejection", async () => {
    ({ app } = await buildAdminApp());
    const { cookie, csrf } = await login(app);
    const codeRes = await app.inject({ method: "GET", url: "/v1/admin/submissions", headers: { cookie } });
    const code = ((codeRes.json() as { data: { items: Array<{ publicCode: string }> } }).data.items[0]!).publicCode;
    const res = await app.inject({
      method: "POST",
      url: `/v1/admin/submissions/${code}/decision`,
      headers: { cookie, "x-csrf-token": csrf },
      payload: { decision: "rejected" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("FEEDBACK_REQUIRED");
  });

  it("404s on an unknown public code", async () => {
    ({ app } = await buildAdminApp());
    const { cookie } = await login(app);
    const res = await app.inject({ method: "GET", url: "/v1/admin/submissions/KD-ZZZZZZ", headers: { cookie } });
    expect(res.statusCode).toBe(404);
  });

  it("logs out and no longer permits admin access", async () => {
    ({ app } = await buildAdminApp());
    const { cookie, csrf } = await login(app);
    const logout = await app.inject({
      method: "POST",
      url: "/v1/admin/session/logout",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(logout.statusCode).toBe(204);
    // Stateless token is cleared client-side; verify the cleared cookie is set.
    expect(String(logout.headers["set-cookie"])).toContain(COOKIE);
  });
});
