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
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

type ValueTag = z.infer<typeof valueTagSchema>;
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;

async function setup() {
  const repository = new MemoryPersistenceRepository();
  const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
  const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
  const onboarding = new OnboardingService(repository, cipher, true);
  const app = await buildApp({ logger: false, sessionService: sessions, onboardingService: onboarding });

  const issued = await sessions.issueForTelegramUser(9007199254740888n, new Date("2026-08-01T10:00:00Z"));
  const session = await sessions.authenticate(issued.sessionToken);
  const userId = session!.user.id;

  const patch: OnboardingProgressPatch = {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    currentStep: "public_preview",
    expectedVersion: 0,
    patch: {
      eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
      publicProfile: {
        gender: "male" as const, countryCode: "ET", city: "Addis Ababa", educationLevel: "masters" as const,
        fieldOfStudy: "Theology", employmentStatus: "employed" as const, occupationCategory: "Education",
        maritalStatus: "never_married" as const, hasChildren: false, heightCm: 180,
      },
      faithAndFamily: {
        faithTradition: "ethiopian_orthodox_tewahedo" as const, marriageIntention: "teklil" as const,
        wantsChildren: "yes" as const, values: ["active_faith", "honesty", "tradition"] as ValueTag[],
        bio: "Data rights test bio, long enough to satisfy the minimum bio length validation rule.",
      },
      partnerPreferences: {
        ageMin: 24, ageMax: 32, preferredCities: ["Addis Ababa"], openToAbroad: false,
        acceptedMaritalStatuses: ["never_married" as const], acceptsPartnerWithChildren: false,
        desiredValues: ["active_faith" as ValueTag], acceptedMarriageIntentions: ["teklil" as const],
        additionalPreferences: "",
      },
    },
  };
  const saved = await onboarding.saveProgress(userId, patch);
  await onboarding.savePrivateIdentity(
    userId,
    { fullName: "Dawit Haile", dateOfBirth: "1994-05-05", phoneNumber: "+251944000000", verificationPhotoStatus: "pending_upload" },
  );
  await onboarding.saveVerificationPhoto(userId, { dataUrl: JPEG });
  await onboarding.submit(userId, {
    expectedVersion: saved.version,
    consent: consentDraftSchema.parse({
      informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
      discoveryPublication: true, verificationPhotoRetention: true, communityRules: true, botNotifications: false,
    }),
  });

  return { app, sessions, onboarding, repository, token: issued.sessionToken, csrf: issued.csrfToken, userId, publicCode: session!.user.publicCode };
}

describe("self-serve data rights (B6)", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("exports the candidate's own bundle with decrypted identity + photo + consents", async () => {
    const ctx = await setup();
    app = ctx.app;
    const res = await app.inject({
      method: "GET",
      url: "/v1/onboarding/export",
      headers: { cookie: `kidan_session=${ctx.token}` },
    });
    expect(res.statusCode).toBe(200);
    const bundle = res.json().data;
    expect(bundle.publicCode).toBe(ctx.publicCode);
    expect(bundle.submitted).toBe(true);
    expect(bundle.identity.fullName).toBe("Dawit Haile");
    expect(bundle.identity.phoneNumber).toBe("+251944000000");
    expect(bundle.verificationPhoto.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(Buffer.from(bundle.verificationPhoto.dataUrl.split(",")[1], "base64").subarray(0, 3))
      .toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(bundle.publicProfile.publicProfile.city).toBe("Addis Ababa");
    expect(bundle.review.status).toBe("pending");
    expect(bundle.consents.length).toBeGreaterThanOrEqual(6);
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("401s export without a session", async () => {
    const ctx = await setup();
    app = ctx.app;
    const res = await app.inject({ method: "GET", url: "/v1/onboarding/export" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects account deletion without CSRF and without confirmation", async () => {
    const ctx = await setup();
    app = ctx.app;
    const noCsrf = await app.inject({
      method: "POST",
      url: "/v1/onboarding/delete-account",
      headers: { cookie: `kidan_session=${ctx.token}` },
      payload: { confirm: true },
    });
    expect(noCsrf.statusCode).toBe(403);

    const noConfirm = await app.inject({
      method: "POST",
      url: "/v1/onboarding/delete-account",
      headers: { cookie: `kidan_session=${ctx.token}`, "x-csrf-token": ctx.csrf },
      payload: {},
    });
    expect(noConfirm.statusCode).toBe(400);
  });

  it("deletes the account and all data, and revokes the session", async () => {
    const ctx = await setup();
    app = ctx.app;
    const res = await app.inject({
      method: "POST",
      url: "/v1/onboarding/delete-account",
      headers: { cookie: `kidan_session=${ctx.token}`, "x-csrf-token": ctx.csrf },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);

    // All personal data is gone.
    expect(await ctx.repository.getDraft(ctx.userId)).toBeNull();
    expect(await ctx.repository.hasCompletePrivateIdentity(ctx.userId)).toBe(false);
    expect(await ctx.repository.hasVerificationPhoto(ctx.userId)).toBe(false);
    expect(await ctx.repository.getCandidateReviewState(ctx.userId)).toBeNull();
    expect(await ctx.repository.listConsentReceipts(ctx.userId)).toEqual([]);

    // The session no longer authenticates.
    const after = await ctx.sessions.authenticate(ctx.token);
    expect(after).toBeNull();

    // A second delete reports not found.
    const again = await ctx.onboarding.deleteAccount(ctx.userId);
    expect(again).toBe(false);
  });
});
