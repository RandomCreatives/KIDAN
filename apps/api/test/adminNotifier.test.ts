import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  consentDraftSchema,
  ONBOARDING_SCHEMA_VERSION,
  valueTagSchema,
  type OnboardingProgressPatch,
} from "@kidan/contracts";
import type { AdminNotifier, AdminNotification } from "../src/notifications/adminNotifier.js";
import { TelegramAdminNotifier } from "../src/notifications/telegramAdminNotifier.js";
import { OnboardingService } from "../src/onboarding/onboardingService.js";
import { ConnectionService } from "../src/connections/connectionService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";
import type { PersistenceRepository } from "../src/persistence/types.js";
import { SessionService } from "../src/auth/sessionService.js";

const BOT_TOKEN = "5432109876:ADMIN_BOT_SECRET_TOKEN_VALUE";
const CONSOLE_URL = "https://kidan-staging-admin.vercel.app";

class SpyNotifier implements AdminNotifier {
  calls: AdminNotification[] = [];
  async notify(n: AdminNotification): Promise<void> {
    this.calls.push(n);
  }
}

describe("operator admin-console bot (new feature)", () => {
  describe("TelegramAdminNotifier", () => {
    it("POSTs a privacy-safe message to the admin chat with an 'Open console' Mini App button", async () => {
      const calls: { url: string; body: Record<string, unknown> }[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any, init?: any) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) as Record<string, unknown> });
        return new Response("{}", { status: 200 });
      }) as typeof fetch;

      try {
        const notifier = new TelegramAdminNotifier(BOT_TOKEN, "987654321", CONSOLE_URL);
        await notifier.notify({ kind: "new_submission", message: "New submission KD-ABC123 is awaiting review." });

        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
        const body = calls[0]!.body;
        expect(body.chat_id).toBe("987654321");
        expect(body.text).toBe("New submission KD-ABC123 is awaiting review.");
        expect(body.protect_content).toBe(true);
        const kb = (body.reply_markup as { inline_keyboard: { text: string; web_app: { url: string } }[][] })
          .inline_keyboard;
        expect(kb[0]![0]!.web_app.url).toBe(CONSOLE_URL);
        // The message and body never leak the bot token.
        expect(JSON.stringify(body)).not.toContain(BOT_TOKEN.split(":")[1]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("OnboardingService submits -> new_submission to admin", () => {
    it("fires the admin notifier with the candidate's public code (privacy-safe)", async () => {
      const repo = new MemoryPersistenceRepository();
      const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
      const sessions = new SessionService(repo, cipher, new SecretHasher(randomBytes(32)));
      const spy = new SpyNotifier();
      const onboarding = new OnboardingService(repo, cipher, true, 100, spy);

      const issued = await sessions.issueForTelegramUser(9007199254740099n, new Date("2026-09-01T10:00:00Z"));
      const session = await sessions.authenticate(issued.sessionToken);
      const userId = session!.user.id;
      const publicCode = session!.user.publicCode;

      const patch: OnboardingProgressPatch = {
        schemaVersion: ONBOARDING_SCHEMA_VERSION,
        currentStep: "public_preview",
        expectedVersion: 0,
        patch: {
          eligibility: { adultConfirmed: true, eotcConfirmed: true, marriageIntentConfirmed: true },
          publicProfile: {
            gender: "female", countryCode: "ET", city: "Bahir Dar", educationLevel: "bachelors" as const,
            fieldOfStudy: "Nursing", employmentStatus: "employed" as const, occupationCategory: "Healthcare",
            maritalStatus: "never_married" as const, hasChildren: false, heightCm: 162,
          },
          faithAndFamily: {
            faithTradition: "ethiopian_orthodox_tewahedo" as const, marriageIntention: "teklil" as const,
            wantsChildren: "yes" as const, values: ["active_faith", "honesty", "family_oriented"] as z.infer<typeof valueTagSchema>[],
            bio: "Long enough bio text for the admin notifier unit test.",
            hasGodfather: true, isDeacon: false, churchServiceActive: true, hasDisability: false,
          },
          partnerPreferences: {
            ageMin: 28, ageMax: 38, preferredCities: ["Bahir Dar"], openToAbroad: false,
            acceptedMaritalStatuses: ["never_married" as const], acceptsPartnerWithChildren: false,
            desiredValues: ["active_faith" as z.infer<typeof valueTagSchema>], acceptedMarriageIntentions: ["teklil" as const], additionalPreferences: "",
          },
        },
      };
      const saved = await onboarding.saveProgress(userId, patch, new Date("2026-09-01T10:00:00Z"));
      await onboarding.savePrivateIdentity(
        userId,
        { fullName: "Sara Girma", dateOfBirth: "1998-06-01", phoneNumber: "+251922000000", verificationPhotoStatus: "pending_upload" },
        new Date("2026-09-01T10:01:00Z"),
      );
      await onboarding.saveVerificationPhoto(userId, { dataUrl: "data:image/jpeg;base64,AA==" }, new Date("2026-09-01T10:02:00Z"));
      await onboarding.submit(
        userId,
        { expectedVersion: saved.version, consent: consentDraftSchema.parse({
          informationAccurate: true, identityProcessing: true, faithDataProcessing: true,
          discoveryPublication: true, verificationPhotoRetention: true, communityRules: true, botNotifications: false,
        }) },
        new Date("2026-09-01T10:03:00Z"),
      );

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0]!.kind).toBe("new_submission");
      expect(spy.calls[0]!.message).toContain(publicCode);
      // Never any identity in the message.
      expect(spy.calls[0]!.message).not.toMatch(/Sara|Girma|\+251|name|phone/i);
    });
  });

  describe("ConnectionService.confirm -> connection_pending_admin", () => {
    it("notifies the admin when a pair reaches mutual_confirmed_pending_admin", async () => {
      const fakeRepo = {
        setConnectionConfirmation: vi.fn().mockResolvedValue({ status: "mutual_confirmed_pending_admin" }),
      } as unknown as PersistenceRepository;
      const spy = new SpyNotifier();
      const service = new ConnectionService(fakeRepo, new IdentityCipher(randomBytes(32), randomBytes(32)), true, spy);

      const result = await service.confirm("u1", "conn-1", true, new Date());
      expect(result.status).toBe("mutual_confirmed_pending_admin");
      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0]!.kind).toBe("connection_pending_admin");
    });

    it("does not notify on a non-pending-admin outcome", async () => {
      const fakeRepo = {
        setConnectionConfirmation: vi.fn().mockResolvedValue({ status: "confirmed" }),
      } as unknown as PersistenceRepository;
      const spy = new SpyNotifier();
      const service = new ConnectionService(fakeRepo, new IdentityCipher(randomBytes(32), randomBytes(32)), true, spy);

      await service.confirm("u1", "conn-1", true, new Date());
      expect(spy.calls).toHaveLength(0);
    });
  });
});
