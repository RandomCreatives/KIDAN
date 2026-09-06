import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { SessionService } from "./auth/sessionService.js";
import type { AdminSessionService } from "./auth/adminSessionService.js";
import type { OnboardingService } from "./onboarding/onboardingService.js";
import type { AdminService } from "./admin/adminService.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { healthRoutes } from "./routes/health.js";
import { onboardingRoutes } from "./routes/onboarding.js";

export interface BuildAppOptions {
  botToken?: string;
  sessionService?: SessionService;
  onboardingService?: OnboardingService;
  cookieName?: string;
  secureCookies?: boolean;
  allowedOrigin?: string;
  logger?: boolean;
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
  // Whether initData-rejection responses include the non-secret diagnostics
  // (configured bot id + live token probe). Always logged server-side; only
  // exposed to the client in non-production runtimes. Defaults to false so a
  // deployment never leaks internals unless it explicitly opts in.
  exposeAuthDiagnostics?: boolean;
}

export type FastifyFactory = typeof Fastify;

export async function buildApp(
  options: BuildAppOptions = {},
  fastifyFactory: FastifyFactory = Fastify,
): Promise<FastifyInstance> {
  const app = fastifyFactory({
    logger: options.logger
      ? {
          level: "info",
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.headers['x-csrf-token']",
              "req.body",
              "res.headers['set-cookie']",
            ],
            censor: "[REDACTED]",
          },
        }
      : false,
    bodyLimit: 32 * 1024,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });

  await app.register(cookie);

  app.addHook("onRequest", async (request, reply) => {
    if (!options.allowedOrigin || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.origin;
    // Accept requests with no Origin header — these are server-side proxy
    // rewrites (e.g. Vercel's /api/* rewrite) where the browser already
    // enforced same-origin on the frontend side.
    if (origin !== undefined && origin !== options.allowedOrigin) {
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
    request.log.error({ errorName, errorCode, errorMessage, stackTop }, "Request failed");
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

  const cookieName = options.cookieName ?? "kidan_session";
  if (options.botToken && options.sessionService) {
    await app.register(authRoutes, {
      botToken: options.botToken,
      sessionService: options.sessionService,
      cookieName,
      secureCookies: options.secureCookies ?? false,
      exposeDiagnostics: options.exposeAuthDiagnostics ?? false,
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
  }

  if (options.adminSessionService && options.adminService) {
    await app.register(adminRoutes, {
      adminSession: options.adminSessionService,
      adminService: options.adminService,
      cookieName: "kidan_admin_session",
      secureCookies: options.secureCookies ?? false,
    });
  }

  return app;
}
