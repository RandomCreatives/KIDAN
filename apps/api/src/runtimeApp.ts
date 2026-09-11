import { dirname, join } from "node:path";
import { buildApp, type BuildAppOptions, type FastifyFactory } from "./appFactory.js";
import { SessionService } from "./auth/sessionService.js";
import { AdminSessionService } from "./auth/adminSessionService.js";
import { parseEnvironment, type RuntimeEnvironment } from "./config/environment.js";
import { createDatabasePool } from "./database/pool.js";
import { createSchemaReadinessCheck } from "./database/readiness.js";
import { FeedbackService } from "./feedback/feedbackService.js";
import { OnboardingService } from "./onboarding/onboardingService.js";
import { AdminService } from "./admin/adminService.js";
import { DiscoveryService } from "./discovery/discoveryService.js";
import { ConnectionService } from "./connections/connectionService.js";
import { RequestService } from "./requests/requestService.js";
import { NoopCandidateNotifier, TelegramCandidateNotifier } from "./notifications/telegramNotifier.js";
import { NoopAdminNotifier, TelegramAdminNotifier } from "./notifications/telegramAdminNotifier.js";
import { NoopPairingNotifier, TelegramPairingNotifier } from "./notifications/pairingNotifier.js";
import { CompletionService } from "./completion/completionService.js";
import type { PairingPulseAnswer } from "./persistence/types.js";
import { PostgresPersistenceRepository } from "./persistence/postgresRepository.js";
import { decodeBase64Key, IdentityCipher, SecretHasher } from "./security/crypto.js";

/** Valid pulse answers (must mirror PairingPulseAnswer; validated at the
 *  runtime boundary because bot callbacks are untrusted input). */
const PAIRING_PULSE_ANSWERS = new Set<string>([
  "going_well", "slow", "drifted", "part", "guidance",
  "ready", "not_yet", "well_after_close", "grateful", "share_feedback",
]);

/** Privacy-safe acknowledgement copy shown by the bot after a button tap. */
function pairingAckText(applied: string, answer: string): string {
  if (applied === "readiness") {
    return answer === "ready"
      ? "🌱 Wonderful. When you are both ready, Kidan will guide the next step inside the app."
      : "🕊 There is no hurry. Keep getting to know each other — Kidan will ask again later.";
  }
  if (applied === "routing_close") {
    return "👋 Understood, with dignity. Open Kidan to close this path — it takes one tap.";
  }
  if (applied === "routing_guidance") {
    return "🙏 Thank you for reaching out. Write to us here, or open Kidan — your words go privately to the Kidan operator.";
  }
  return "💛 Noted — thank you. Kidan is walking with you.";
}

function isENOENT(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code: string }).code === "ENOENT";
}

/**
 * Loads a local `.env` file for development and the migration CLI.
 * Vercel injects environment variables directly, so on staging/production no
 * `.env` exists and this is a no-op. Local runnables may be started from any
 * workspace directory (e.g. `apps/api/`), so walk up to the repository root
 * rather than only checking `process.cwd()`.
 */
export function loadLocalEnvironmentFile(): void {
  let dir = process.cwd();
  // Walk up from the working directory to the filesystem root.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      process.loadEnvFile(join(dir, ".env"));
      return;
    } catch (error) {
      if (!isENOENT(error)) throw error;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

export async function buildRuntimeApp(
  input: NodeJS.ProcessEnv = process.env,
  fastifyFactory?: FastifyFactory,
): Promise<{ app: Awaited<ReturnType<typeof buildApp>>; environment: RuntimeEnvironment }> {
  const environment = parseEnvironment(input);
  const production = environment.NODE_ENV === "production";
  const options: BuildAppOptions = {
    logger: true,
    secureCookies: production,
    cookieName: production ? "__Host-kidan_session" : "kidan_session",
    // Non-secret auth diagnostics (configured bot id + token probe) are
    // returned to the client only outside production; they are always logged.
    exposeAuthDiagnostics: !production,
    // The candidate Mini App and the operator admin console are served from
    // different origins; both must be allowed for state-changing requests.
    // APP_ORIGIN/ADMIN_ORIGIN come from the environment; when the app origin is
    // configured (staging/production) the admin origin falls back to the known
    // pilot staging console so the pilot works without extra env configuration.
    // Production sets ADMIN_ORIGIN to its own domain. With no origins set at
    // all (local development) the gate stays off.
    ...(environment.APP_ORIGIN || environment.ADMIN_ORIGIN
      ? {
          allowedOrigins: [
            environment.APP_ORIGIN,
            environment.ADMIN_ORIGIN
              ?? (environment.APP_ORIGIN ? "https://kidan-staging-admin.vercel.app" : undefined),
          ].filter((value): value is string => Boolean(value)),
        }
      : {}),
  };

  const persistenceConfigured = Boolean(
    environment.DATABASE_URL
    && environment.TELEGRAM_BOT_TOKEN
    && environment.SESSION_SECRET
    && environment.IDENTITY_ENCRYPTION_KEY
    && environment.IDENTITY_LOOKUP_KEY,
  );

  if (persistenceConfigured) {
    const pool = createDatabasePool(environment.DATABASE_URL as string);
    const repository = new PostgresPersistenceRepository(pool);
    const encryptionKey = decodeBase64Key(environment.IDENTITY_ENCRYPTION_KEY as string, "IDENTITY_ENCRYPTION_KEY");
    const lookupKey = decodeBase64Key(environment.IDENTITY_LOOKUP_KEY as string, "IDENTITY_LOOKUP_KEY");
    const sessionKey = decodeBase64Key(environment.SESSION_SECRET as string, "SESSION_SECRET");
    if (encryptionKey.equals(lookupKey) || encryptionKey.equals(sessionKey) || lookupKey.equals(sessionKey)) {
      throw new Error("Encryption, lookup, and session keys must be independent");
    }
    const identityCipher = new IdentityCipher(encryptionKey, lookupKey);
    const sessionService = new SessionService(repository, identityCipher, new SecretHasher(sessionKey));
    // Defensive: a trailing space/newline in the pasted env var breaks the
    // initData HMAC while leaving the numeric bot id prefix looking correct.
    options.botToken = (environment.TELEGRAM_BOT_TOKEN as string).trim();
    // Log the public bot id (numeric user id, before ':') at startup so a
    // token-vs-bot mismatch can be confirmed without a login attempt.
    const configuredBotId = (environment.TELEGRAM_BOT_TOKEN as string).includes(":")
      ? (environment.TELEGRAM_BOT_TOKEN as string).split(":")[0]
      : "malformed-token";
    console.info(`[kidan-api] configured Telegram bot id: ${configuredBotId}`);
    options.sessionService = sessionService;
    // Operator admin-console bot (separate bot from the candidate bot). It
    // nags the operator on new submissions and connections awaiting approval,
    // with a one-tap "Open console" Telegram Mini App button. Enabled only when
    // the admin bot token, operator chat id, and admin console URL are all set;
    // otherwise the no-op notifier is used.
    const adminConsoleConfigured = Boolean(environment.ADMIN_BOT_TOKEN && environment.ADMIN_CHAT_ID && environment.ADMIN_CONSOLE_URL);
    const adminNotifier = adminConsoleConfigured
      ? new TelegramAdminNotifier(environment.ADMIN_BOT_TOKEN!.trim(), environment.ADMIN_CHAT_ID!.trim(), environment.ADMIN_CONSOLE_URL!.trim())
      : new NoopAdminNotifier();
    // Startup diagnostics (booleans only — never the secret/token values).
    console.info(
      "[kidan-api] admin bot: "
      + `token=${Boolean(environment.ADMIN_BOT_TOKEN)} chatId=${Boolean(environment.ADMIN_CHAT_ID)} `
      + `consoleUrl=${Boolean(environment.ADMIN_CONSOLE_URL)} `
      + `notifyTestSecret=${Boolean(environment.ADMIN_NOTIFY_TEST_SECRET)}`,
    );
    const onboardingService = new OnboardingService(
      repository,
      identityCipher,
      environment.ENABLE_REAL_SUBMISSIONS === "true",
      environment.PILOT_CAPACITY,
      adminNotifier,
    );
    options.onboardingService = onboardingService;
    // Track C: values-only discovery (only serves real cards when submissions
    // are enabled; otherwise returns an empty feed).
    options.discoveryService = new DiscoveryService(
      repository,
      identityCipher,
      environment.ENABLE_REAL_SUBMISSIONS === "true",
    );
    // Kidan Completion: the post-match journey. Tracks every connected pair,
    // unlocks the reveal loop on the 7-day/20-message gate, runs the stall
    // defense, and schedules bot pulses. The notifier speaks to the candidate
    // bot (codes only, never names/phones); no-op when the token is absent.
    const completionService = new CompletionService(repository, identityCipher);
    const pairingNotifier = environment.TELEGRAM_BOT_TOKEN
      ? new TelegramPairingNotifier(environment.TELEGRAM_BOT_TOKEN.trim())
      : new NoopPairingNotifier();
    // Track D: admin-gated connections.
    options.connectionService = new ConnectionService(
      repository,
      identityCipher,
      environment.ENABLE_REAL_SUBMISSIONS === "true",
      adminNotifier,
      {
        onConnected: async (connectionId, now) => {
          await completionService.onConnected({ connectionId, now });
        },
        onIntroductionMessage: async (connectionId, senderUserId, now) => {
          await completionService.onMessage({ connectionId, senderUserId, now });
        },
      },
    );
    // Track D2: intentional introduction requests (rate-capped, 72h TTL).
    // Serial-dater gate: a long-silent, un-closed pairing blocks new picks.
    options.requestService = new RequestService(
      repository,
      identityCipher,
      environment.ENABLE_REAL_SUBMISSIONS === "true",
      undefined,
      undefined,
      (userId) => completionService.isNewPickBlocked(userId),
    );
    // Feedback / comments / concerns from candidates to the operator.
    options.feedbackService = new FeedbackService(repository, adminNotifier);

    // Candidate-bot tier resolver (Option A). Resolves a Telegram user id to
    // 'active' (approved) or 'new' (not yet approved) using the stored profile
    // state, so @KidanAppBot can show the correct two-tier menu. Gated by a
    // bearer secret so the bot resolves tiers without a session.
    const botStateSecret = environment.BOT_STATE_SECRET;
    if (botStateSecret) {
      options.botStateSecret = botStateSecret;
      options.botState = async (telegramUserId) => {
        const lookupHash = identityCipher.lookupHash(`telegram:${telegramUserId}`);
        const user = await repository.findUserByTelegramLookupHash(lookupHash);
        if (!user) return "new";
        // Approved/working users are "active"; anyone still onboarding or not
        // yet approved is "new".
        const status = await repository.getUserStatus(user.id);
        const active = status === "active" || status === "paused" || status === "suspended";
        return active ? "active" : "new";
      };
      // Kidan Completion (Phase 2): the bot forwards `pair:` inline-button
      // callbacks here; we resolve the Telegram user and apply the answer to
      // the journey state machine, returning the ack text the bot displays.
      options.pairingAnswer = async (telegramUserId, pulseId, answer) => {
        if (!PAIRING_PULSE_ANSWERS.has(answer)) throw new Error("PAIRING_ANSWER_UNKNOWN");
        const lookupHash = identityCipher.lookupHash(`telegram:${telegramUserId}`);
        const user = await repository.findUserByTelegramLookupHash(lookupHash);
        if (!user) throw new Error("PAIRING_USER_UNKNOWN");
        const result = await completionService.answerPulse(pulseId, user.id, answer as PairingPulseAnswer, new Date());
        return { text: pairingAckText(result.applied, answer) };
      };
    }

    // Kidan Completion (Phase 2): daily scheduler. Computes due dispatches
    // (readiness re-asks, pulses, stall probes, closing follow-ups) and drains
    // the send queue through the candidate bot. Sends are best-effort: any
    // failure leaves the pulse pending for the next run.
    const completionTickSecret = environment.COMPLETION_CRON_SECRET;
    if (completionTickSecret) {
      options.completionTickSecret = completionTickSecret;
      options.completionTick = async () => {
        const now = new Date();
        const dispatches = await completionService.tick(now);
        const pending = await repository.listPendingPulseSends(500);
        const sentIds: string[] = [];
        for (const pulse of pending) {
          try {
            const ciphertext = await repository.getCandidateTelegramIdCiphertext(pulse.userId);
            if (!ciphertext) {
              sentIds.push(pulse.id); // no delivery channel; drop from queue
              continue;
            }
            const telegramId = BigInt(identityCipher.decrypt(ciphertext, "telegram-id"));
            const summary = await repository.getConnectionSummary(pulse.connectionId);
            const counterpartCode = summary
              ? summary.userAId === pulse.userId ? summary.userBCode : summary.userACode
              : "K-??????";
            await pairingNotifier.sendPulse(telegramId, { pulse, counterpartCode });
            sentIds.push(pulse.id);
          } catch {
            /* leave pending; tomorrow's tick retries */
          }
        }
        if (sentIds.length > 0) await repository.markPulsesSent(sentIds, now);
        return { due: dispatches.length, sent: sentIds.length };
      };
    }

    // Readiness proves a live connection AND that the schema migrations have
    // been applied (the auth/onboarding tables exist). A provisioned but
    // unmigrated database now reports 503 instead of failing logins with 500.
    options.readinessCheck = createSchemaReadinessCheck(pool);
    options.onClose = () => pool.end();
    const retentionSecret = environment.RETENTION_CRON_SECRET;
    // Track E3 monitoring: PII-free auth-failure/server_error signals written to
    // audit_event and reported by /internal/health (gated by MONITOR_CRON_SECRET).
    // Operator helper: /internal/admin-notify-test fires a test admin-console-bot
    // notification so the operator can verify the bot without a real submission.
    if (environment.ADMIN_NOTIFY_TEST_SECRET && environment.ADMIN_BOT_TOKEN
      && environment.ADMIN_CHAT_ID && environment.ADMIN_CONSOLE_URL) {
      const testNotifier = new TelegramAdminNotifier(
        environment.ADMIN_BOT_TOKEN.trim(),
        environment.ADMIN_CHAT_ID.trim(),
        environment.ADMIN_CONSOLE_URL.trim(),
      );
      options.adminNotifyTestSecret = environment.ADMIN_NOTIFY_TEST_SECRET;
      options.adminNotifyTest = (message) => testNotifier.notify({ kind: "new_submission", message });
    }
    if (environment.MONITOR_CRON_SECRET) {
      options.monitorSecret = environment.MONITOR_CRON_SECRET;
      options.recordOperationalEvent = (event, now) => {
        void repository.recordOperationalEvent(event, now).catch(() => undefined);
      };
      options.countOperationalEventsSince = (events, since) =>
        repository.countOperationalEventsSince(events, since);
    }
    if (retentionSecret) {
      options.retentionSecret = retentionSecret;
      // Retention: 30-day verification-photo purge PLUS Track D2 housekeeping
      // (expire unanswered/declined requests past 72h and delete swipe/request
      // records for connected pairs). Counts only are logged (no identity).
      options.retentionPurge = async () => {
        const purged = await onboardingService.purgeExpiredVerificationPhotos();
        const requests = await repository.purgeExpiredIntroductionData(new Date());
        console.info(
          `[kidan-api] introduction retention: ${requests.expiredRequests} expired, `
          + `${requests.deletedRequests} connected-pair requests deleted, `
          + `${requests.deletedSwipes} connected-pair swipes deleted`,
        );
        return purged;
      };
    }

    // B3: operator admin review console. Enabled only when an operator
    // password is provisioned. The stateless admin session is signed with the
    // existing SESSION_SECRET but uses its own cookie/domain separation.
    if (environment.ADMIN_CONSOLE_PASSWORD) {
      const adminSession = new AdminSessionService(sessionKey, environment.ADMIN_CONSOLE_PASSWORD.trim());
      // B4: privacy-safe Telegram notifications when the bot token and Mini
      // App URL are configured; otherwise decisions succeed silently.
      const notifier = environment.MINI_APP_URL && environment.TELEGRAM_BOT_TOKEN
        ? new TelegramCandidateNotifier(environment.TELEGRAM_BOT_TOKEN.trim(), environment.MINI_APP_URL)
        : new NoopCandidateNotifier();
      const adminService = new AdminService(repository, identityCipher, notifier);
      options.adminSessionService = adminSession;
      options.adminService = adminService;
      console.info("[kidan-api] admin review console enabled");
    }
  }

  const app = fastifyFactory
    ? await buildApp(options, fastifyFactory)
    : await buildApp(options);
  return { app, environment };
}
