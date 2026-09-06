import { dirname, join } from "node:path";
import { buildApp, type BuildAppOptions, type FastifyFactory } from "./appFactory.js";
import { SessionService } from "./auth/sessionService.js";
import { AdminSessionService } from "./auth/adminSessionService.js";
import { parseEnvironment, type RuntimeEnvironment } from "./config/environment.js";
import { createDatabasePool } from "./database/pool.js";
import { createSchemaReadinessCheck } from "./database/readiness.js";
import { OnboardingService } from "./onboarding/onboardingService.js";
import { AdminService } from "./admin/adminService.js";
import { DiscoveryService } from "./discovery/discoveryService.js";
import { NoopCandidateNotifier, TelegramCandidateNotifier } from "./notifications/telegramNotifier.js";
import { PostgresPersistenceRepository } from "./persistence/postgresRepository.js";
import { decodeBase64Key, IdentityCipher, SecretHasher } from "./security/crypto.js";

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
    ...(environment.APP_ORIGIN ? { allowedOrigin: environment.APP_ORIGIN } : {}),
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
    const onboardingService = new OnboardingService(
      repository,
      identityCipher,
      environment.ENABLE_REAL_SUBMISSIONS === "true",
    );
    options.onboardingService = onboardingService;
    // Track C: values-only discovery (only serves real cards when submissions
    // are enabled; otherwise returns an empty feed).
    options.discoveryService = new DiscoveryService(
      repository,
      identityCipher,
      environment.ENABLE_REAL_SUBMISSIONS === "true",
    );
    // Readiness proves a live connection AND that the schema migrations have
    // been applied (the auth/onboarding tables exist). A provisioned but
    // unmigrated database now reports 503 instead of failing logins with 500.
    options.readinessCheck = createSchemaReadinessCheck(pool);
    options.onClose = () => pool.end();
    const retentionSecret = environment.RETENTION_CRON_SECRET;
    if (retentionSecret) {
      options.retentionSecret = retentionSecret;
      options.retentionPurge = () => onboardingService.purgeExpiredVerificationPhotos();
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
