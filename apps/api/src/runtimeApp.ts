import { dirname, join } from "node:path";
import { buildApp, type BuildAppOptions, type FastifyFactory } from "./appFactory.js";
import { SessionService } from "./auth/sessionService.js";
import { parseEnvironment, type RuntimeEnvironment } from "./config/environment.js";
import { createDatabasePool } from "./database/pool.js";
import { createSchemaReadinessCheck } from "./database/readiness.js";
import { OnboardingService } from "./onboarding/onboardingService.js";
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
    options.botToken = environment.TELEGRAM_BOT_TOKEN as string;
    options.sessionService = sessionService;
    options.onboardingService = new OnboardingService(
      repository,
      identityCipher,
      environment.ENABLE_REAL_SUBMISSIONS === "true",
    );
    // Readiness proves a live connection AND that the schema migrations have
    // been applied (the auth/onboarding tables exist). A provisioned but
    // unmigrated database now reports 503 instead of failing logins with 500.
    options.readinessCheck = createSchemaReadinessCheck(pool);
    options.onClose = () => pool.end();
  }

  const app = fastifyFactory
    ? await buildApp(options, fastifyFactory)
    : await buildApp(options);
  return { app, environment };
}
