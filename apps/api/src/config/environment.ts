import { z } from "zod";

const optionalNonEmpty = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  APP_ORIGIN: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.url().transform((value) => new URL(value).origin).optional(),
  ),
  DATABASE_URL: optionalNonEmpty,
  TELEGRAM_BOT_TOKEN: optionalNonEmpty,
  SESSION_SECRET: optionalNonEmpty,
  IDENTITY_ENCRYPTION_KEY: optionalNonEmpty,
  IDENTITY_LOOKUP_KEY: optionalNonEmpty,
  ENABLE_REAL_SUBMISSIONS: z.enum(["true", "false"]).default("false"),
  RETENTION_CRON_SECRET: optionalNonEmpty,
  // B3 admin review console. When set, the separate operator console and its
  // /v1/admin/* endpoints are enabled. SESSION_SECRET is reused to sign the
  // stateless admin session cookie (a distinct domain prefix and the separate
  // cookie name keep it isolated from candidate sessions).
  ADMIN_CONSOLE_PASSWORD: optionalNonEmpty,
}).superRefine((environment, context) => {
  const persistenceKeys = [
    "DATABASE_URL",
    "TELEGRAM_BOT_TOKEN",
    "SESSION_SECRET",
    "IDENTITY_ENCRYPTION_KEY",
    "IDENTITY_LOOKUP_KEY",
  ] as const;
  const configured = persistenceKeys.filter((key) => environment[key] !== undefined);
  if (configured.length !== 0 && configured.length !== persistenceKeys.length) {
    context.addIssue({
      code: "custom",
      message: `Persistence configuration must set all of: ${persistenceKeys.join(", ")}`,
      path: ["DATABASE_URL"],
    });
  }
  if (environment.NODE_ENV === "production" && configured.length !== persistenceKeys.length) {
    context.addIssue({ code: "custom", message: "Production requires persistence configuration" });
  }
  if (environment.NODE_ENV === "production" && !environment.APP_ORIGIN) {
    context.addIssue({ code: "custom", message: "Production requires APP_ORIGIN", path: ["APP_ORIGIN"] });
  }
});

export type RuntimeEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): RuntimeEnvironment {
  return environmentSchema.parse(input);
}
