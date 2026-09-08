import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import Fastify, {
  type FastifyInstance,
  type FastifyLoggerOptions,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type { SessionService } from "./auth/sessionService.js";
import type { AdminSessionService } from "./auth/adminSessionService.js";
import type { OnboardingService } from "./onboarding/onboardingService.js";
import type { AdminService } from "./admin/adminService.js";
import type { DiscoveryService } from "./discovery/discoveryService.js";
import type { ConnectionService } from "./connections/connectionService.js";
import type { RequestService } from "./requests/requestService.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { discoveryRoutes } from "./routes/discovery.js";
import { connectionRoutes } from "./routes/connections.js";
import { requestRoutes } from "./routes/requests.js";
import { healthRoutes } from "./routes/health.js";
import { onboardingRoutes } from "./routes/onboarding.js";

export interface BuildAppOptions {
  botToken?: string;
  sessionService?: SessionService;
  onboardingService?: OnboardingService;
  cookieName?: string;
  secureCookies?: boolean;
  allowedOrigin?: string;
  /** Browser origins permitted to make state-changing (non-GET) requests. The
   *  candidate Mini App and the operator admin console are served from
   *  different origins, so production allows both. Supersedes allowedOrigin. */
  allowedOrigins?: string[];
  /** The Fastify logger. `false` disables logging; `true` uses the defaults
   *  (info + redaction); an object is merged with the same mandatory redaction
   *  paths (so tests can capture logs to a stream while secrets stay redacted). */
  logger?: boolean | FastifyLoggerOptions;
  /** Whether to include the full request body path in redaction (already the
   *  default). Exposed for the log-redaction verification test. */
  onClose?: () => Promise<void>;
  readinessCheck?: () => Promise<void>;
  // When set, enables the internal scheduled maintenance endpoint
  // (POST /internal/retention) guarded by a bearer secret. Used for the
  // 30-day verification-photo purge.
  retentionPurge?: () => Promise<string[]>;
  retentionSecret?: string;
  // B3: separate operator admin console. Enabled only when both are supplied;
  // its routes share the API origin but use a distinct cookie and password.
  adminSessionService?: AdminSessionService;
  adminService?: AdminService;
  // Track C: values-only discovery feed + decisions.
  discoveryService?: DiscoveryService;
  // Track D: admin-gated connections.
  connectionService?: ConnectionService;
  // Track D2: intentional introduction requests.
  requestService?: RequestService;
  // Whether initData-rejection responses include the non-secret diagnostics
  // (configured bot id + live token probe). Always logged server-side; only
  // exposed to the client in non-production runtimes. Defaults to false so a
  // deployment never leaks internals unless it explicitly opts in.
  exposeAuthDiagnostics?: boolean;
  // Track E3 monitoring: fire-and-forget, PII-free operational signals used for
  // alerting. When a monitorSecret is supplied, a /internal/health probe is
  // registered (bearer-gated) that runs the readiness write-probe and reports
  // recent auth-failure / server-error volume for uptime/alerting.
  monitorSecret?: string;
  recordOperationalEvent?: (event: "auth_failure" | "server_error", now: Date) => void;
  countOperationalEventsSince?: (
    events: ("auth_failure" | "server_error")[],
    since: Date,
  ) => Promise<number>;
  /** Operator helper: fire a test admin-console-bot notification (privacy-safe). */
  adminNotifyTestSecret?: string;
  adminNotifyTest?: (message: string) => Promise<void>;
}

export type FastifyFactory = typeof Fastify;

export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-csrf-token']",
  "req.body",
  "res.headers['set-cookie']",
] as const;

export type LoggerOption =
  | boolean
  | (FastifyLoggerOptions & { redact?: { paths?: string[]; censor?: string } });

/** Build the Fastify logger config, always enforcing the redaction paths. */
function loggerConfig(logger: LoggerOption): false | FastifyLoggerOptions {
  if (logger === false) return false;
  const base = (typeof logger === "object" && logger !== null ? logger : {}) as
    FastifyLoggerOptions & { redact?: { paths?: string[]; censor?: string } };
  return {
    level: base.level ?? "info",
    ...base,
    redact: {
      paths: [...LOG_REDACT_PATHS, ...(base.redact?.paths ?? [])],
      censor: base.redact?.censor ?? "[REDACTED]",
    },
  } as FastifyLoggerOptions;
}

export async function buildApp(
  options: BuildAppOptions = {},
  fastifyFactory: FastifyFactory = Fastify,
): Promise<FastifyInstance> {
  const app = fastifyFactory({
    logger: loggerConfig(options.logger ?? false),
    bodyLimit: 32 * 1024,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });

  await app.register(cookie);

  const allowedOrigins = options.allowedOrigins
    ?? (options.allowedOrigin ? [options.allowedOrigin] : []);
  app.addHook("onRequest", async (request, reply) => {
    if (allowedOrigins.length === 0 || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.origin;
    // Accept requests with no Origin header — these are server-side proxy
    // rewrites (e.g. Vercel's /api/* rewrite) where the browser already
    // enforced same-origin on the frontend side.
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: { code: "INVALID_ORIGIN", requestId: request.id } });
    }
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorCode = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
    // Log the message and first stack frame so 500s are diagnosable, while
    // stripping connection-string credentials that could appear in the message
    // (the logger's redact config already covers headers/cookies/body).
    const sanitize = (value: string): string =>
      value.replace(/(postgres(?:ql)?:\/\/)[^/\s]*@/gi, "$1<redacted>@");
    const errorMessage = sanitize(error instanceof Error ? error.message : "unknown error");
    const stackTop = error instanceof Error && error.stack
      ? error.stack.split("\n").slice(1, 3).map((line) => line.trim()).join(" | ")
      : undefined;
    // Fastify rejects bodies exceeding the route bodyLimit (status 413) — a
    // client-fixable condition (the miniapp downsizes photos), not a server
    // fault, so it must not surface as a generic 500.
    if (errorCode === "FST_ERR_CTP_BODY_TOO_LARGE") {
      request.log.warn({ errorName, errorCode }, "Request rejected: body too large");
      return reply.code(413).send({ error: { code: "PHOTO_TOO_LARGE", requestId: request.id } });
    }
    request.log.error({ errorName, errorCode, errorMessage, stackTop }, "Request failed");
    // Track E3: PII-free operational signal for alerting (never the body).
    options.recordOperationalEvent?.("server_error", new Date());
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { code: "NOT_FOUND", requestId: request.id } }),
  );

  if (options.onClose) app.addHook("onClose", options.onClose);

  await app.register(healthRoutes, {
    ...(options.readinessCheck ? { readinessCheck: options.readinessCheck } : {}),
  });

  // Internal scheduled maintenance: purges expired verification photos.
  // Authenticated by a bearer secret (Vercel CRON_SECRET); not reachable by
  // candidate sessions.
  if (options.retentionPurge && options.retentionSecret) {
    app.post("/internal/retention", async (request, reply) => {
      const authorization = request.headers.authorization;
      const expected = `Bearer ${options.retentionSecret}`;
      if (typeof authorization !== "string" || authorization !== expected) {
        return reply.code(401).send({ error: { code: "UNAUTHENTICATED", requestId: request.id } });
      }
      const purged = await options.retentionPurge!();
      request.log.info({ purgedCount: purged.length }, "verification photo retention purge");
      return reply.code(200).send({ data: { purged: purged.length } });
    });
  }

  // Track E3: operator health/alert probe. Runs the /ready injection write-probe
  // (when available) and reports recent auth-failure / server-error volume so a
  // cron or uptime monitor can alert. Bearer-gated like /internal/retention.
  const monitorSecret = options.monitorSecret;
  const countEvents = options.countOperationalEventsSince;
  const readinessCheck = options.readinessCheck;
  if (monitorSecret && countEvents) {
    app.get("/internal/health", async (request, reply) => {
      const authorization = request.headers.authorization;
      const expected = `Bearer ${monitorSecret}`;
      if (typeof authorization !== "string" || authorization !== expected) {
        return reply.code(401).send({ error: { code: "UNAUTHENTICATED", requestId: request.id } });
      }
      let ready = true;
      if (readinessCheck) {
        try {
          await readinessCheck();
        } catch {
          ready = false;
        }
      }
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [authFailures, serverErrors] = await Promise.all([
        countEvents(["auth_failure"], since),
        countEvents(["server_error"], since),
      ]);
      const degraded = authFailures > 100 || serverErrors > 50;
      return reply.send({
        data: { ok: ready && !degraded, ready, degraded, authFailures24h: authFailures, serverErrors24h: serverErrors },
      });
    });
  }

  // Operator helper (opt-in): fire a test admin notification to verify the
  // admin bot is wired up. Bearer-gated so it is never publicly reachable.
  const adminNotifyTestSecret = options.adminNotifyTestSecret;
  const adminNotifyTest = options.adminNotifyTest;
  if (adminNotifyTestSecret && adminNotifyTest) {
    app.get("/internal/admin-notify-test", async (request, reply) => {
      const authorization = request.headers.authorization;
      const expected = `Bearer ${adminNotifyTestSecret}`;
      if (typeof authorization !== "string" || authorization !== expected) {
        return reply.code(401).send({ error: { code: "UNAUTHENTICATED", requestId: request.id } });
      }
      await adminNotifyTest("Test: admin console bot is working. Open console to review.");
      return reply.send({ data: { sent: true } });
    });
  }

  const cookieName = options.cookieName ?? "kidan_session";
  if (options.botToken && options.sessionService) {
    await app.register(authRoutes, {
      botToken: options.botToken,
      sessionService: options.sessionService,
      cookieName,
      secureCookies: options.secureCookies ?? false,
      exposeDiagnostics: options.exposeAuthDiagnostics ?? false,
      ...(options.recordOperationalEvent
        ? { recordOperationalEvent: options.recordOperationalEvent }
        : {}),
      ...(options.onboardingService
        ? { realSubmissionsEnabled: options.onboardingService.isRealSubmissionsEnabled() }
        : {}),
    });
  } else {
    // Persistence is not configured (or not ready). Answer the auth endpoints
    // with an explicit 503 instead of falling through to a 404/500 so the
    // mini app can show a recoverable "service unavailable" state.
    const authNotReady = async (request: FastifyRequest, reply: FastifyReply) => {
      await reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    };
    app.post("/v1/auth/telegram", authNotReady);
    app.get("/v1/session", authNotReady);
  }
  if (options.sessionService && options.onboardingService) {
    await app.register(onboardingRoutes, {
      sessionService: options.sessionService,
      onboardingService: options.onboardingService,
      cookieName,
    });
  } else {
    const draftNotReady = async (request: FastifyRequest, reply: FastifyReply) => {
      await reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    };
    app.get("/v1/onboarding/draft", draftNotReady);
    app.put("/v1/onboarding/draft", draftNotReady);
    app.get("/v1/onboarding/review-status", draftNotReady);
    app.get("/v1/onboarding/export", draftNotReady);
    app.post("/v1/onboarding/delete-account", draftNotReady);
  }

  if (options.sessionService && options.discoveryService) {
    await app.register(discoveryRoutes, {
      sessionService: options.sessionService,
      discoveryService: options.discoveryService,
      cookieName,
    });
  } else {
    const discoveryNotReady = async (request: FastifyRequest, reply: FastifyReply) => {
      await reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    };
    app.get("/v1/discovery/feed", discoveryNotReady);
    app.post("/v1/discovery/decision", discoveryNotReady);
  }

  if (options.sessionService && options.connectionService) {
    await app.register(connectionRoutes, {
      sessionService: options.sessionService,
      connectionService: options.connectionService,
      cookieName,
    });
  } else {
    const connectionsNotReady = async (request: FastifyRequest, reply: FastifyReply) => {
      await reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    };
    app.get("/v1/connections", connectionsNotReady);
    app.post("/v1/connections/:id/confirm", connectionsNotReady);
    app.get("/v1/connections/:id/introduction", connectionsNotReady);
    app.post("/v1/connections/:id/introduction", connectionsNotReady);
  }

  if (options.sessionService && options.requestService) {
    await app.register(requestRoutes, {
      sessionService: options.sessionService,
      requestService: options.requestService,
      cookieName,
    });
  } else {
    const requestsNotReady = async (request: FastifyRequest, reply: FastifyReply) => {
      await reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    };
    app.post("/v1/discovery/request", requestsNotReady);
    app.get("/v1/requests/incoming", requestsNotReady);
    app.get("/v1/requests/outgoing", requestsNotReady);
    app.post("/v1/requests/:id/respond", requestsNotReady);
  }

  if (options.adminSessionService && options.adminService) {
    await app.register(adminRoutes, {
      adminSession: options.adminSessionService,
      adminService: options.adminService,
      ...(options.connectionService ? { connectionService: options.connectionService } : {}),
      cookieName: "kidan_admin_session",
      secureCookies: options.secureCookies ?? false,
    });
  }

  return app;
}
