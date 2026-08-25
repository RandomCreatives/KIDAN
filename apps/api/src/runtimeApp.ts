import { buildApp, type BuildAppOptions, type FastifyFactory } from "./appFactory.js";
import { SessionService } from "./auth/sessionService.js";
import { parseEnvironment, type RuntimeEnvironment } from "./config/environment.js";
import { createDatabasePool } from "./database/pool.js";
import { OnboardingService } from "./onboarding/onboardingService.js";
import { PostgresPersistenceRepository } from "./persistence/postgresRepository.js";
import { decodeBase64Key, IdentityCipher, SecretHasher } from "./security/crypto.js";

export function loadLocalEnvironmentFile(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
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

  if (
    environment.DATABASE_URL
    && environment.TELEGRAM_BOT_TOKEN
    && environment.SESSION_SECRET
    && environment.IDENTITY_ENCRYPTION_KEY
    && environment.IDENTITY_LOOKUP_KEY
  ) {
    const pool = createDatabasePool(environment.DATABASE_URL);
    const repository = new PostgresPersistenceRepository(pool);
    const encryptionKey = decodeBase64Key(environment.IDENTITY_ENCRYPTION_KEY, "IDENTITY_ENCRYPTION_KEY");
    const lookupKey = decodeBase64Key(environment.IDENTITY_LOOKUP_KEY, "IDENTITY_LOOKUP_KEY");
    const sessionKey = decodeBase64Key(environment.SESSION_SECRET, "SESSION_SECRET");
    if (encryptionKey.equals(lookupKey) || encryptionKey.equals(sessionKey) || lookupKey.equals(sessionKey)) {
      throw new Error("Encryption, lookup, and session keys must be independent");
    }
    const identityCipher = new IdentityCipher(encryptionKey, lookupKey);
    const sessionService = new SessionService(repository, identityCipher, new SecretHasher(sessionKey));
    options.botToken = environment.TELEGRAM_BOT_TOKEN;
    options.sessionService = sessionService;
    options.onboardingService = new OnboardingService(
      repository,
      identityCipher,
      environment.ENABLE_REAL_SUBMISSIONS === "true",
    );
    options.readinessCheck = async () => {
      await pool.query("SELECT 1");
    };
    options.onClose = () => pool.end();
  }

  const app = fastifyFactory
    ? await buildApp(options, fastifyFactory)
    : await buildApp(options);
  return { app, environment };
}
