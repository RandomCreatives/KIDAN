import { buildApp, type BuildAppOptions } from "./app.js";
import { SessionService } from "./auth/sessionService.js";
import { parseEnvironment } from "./config/environment.js";
import { createDatabasePool } from "./database/pool.js";
import { OnboardingService } from "./onboarding/onboardingService.js";
import { PostgresPersistenceRepository } from "./persistence/postgresRepository.js";
import { decodeBase64Key, IdentityCipher, SecretHasher } from "./security/crypto.js";

const environment = parseEnvironment(process.env);
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
  let pool;
  try {
    pool = createDatabasePool(environment.DATABASE_URL);
    await pool.query("SELECT 1");
  } catch (dbError) {
    console.error("Database connection failed:", dbError);
    throw new Error(`Database connection failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
  }

  const repository = new PostgresPersistenceRepository(pool);
  let encryptionKey, lookupKey, sessionKey;
  try {
    encryptionKey = decodeBase64Key(environment.IDENTITY_ENCRYPTION_KEY, "IDENTITY_ENCRYPTION_KEY");
    lookupKey = decodeBase64Key(environment.IDENTITY_LOOKUP_KEY, "IDENTITY_LOOKUP_KEY");
    sessionKey = decodeBase64Key(environment.SESSION_SECRET, "SESSION_SECRET");
  } catch (keyError) {
    console.error("Key decode failed:", keyError);
    throw new Error(`Key decode failed: ${keyError instanceof Error ? keyError.message : String(keyError)}`);
  }

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

const app = await buildApp(options);

export default app;