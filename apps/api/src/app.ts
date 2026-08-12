import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { SessionService } from "./auth/sessionService.js";
import type { OnboardingService } from "./onboarding/onboardingService.js";
import { authRoutes } from "./routes/auth.js";
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
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
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
    if (request.headers.origin !== options.allowedOrigin) {
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
    request.log.error({ errorName, errorCode }, "Request failed");
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { code: "NOT_FOUND", requestId: request.id } }),
  );

  if (options.onClose) app.addHook("onClose", options.onClose);

  await app.register(healthRoutes, {
    ...(options.readinessCheck ? { readinessCheck: options.readinessCheck } : {}),
  });

  const cookieName = options.cookieName ?? "kidan_session";
  if (options.botToken && options.sessionService) {
    await app.register(authRoutes, {
      botToken: options.botToken,
      sessionService: options.sessionService,
      cookieName,
      secureCookies: options.secureCookies ?? false,
    });
  }
  if (options.sessionService && options.onboardingService) {
    await app.register(onboardingRoutes, {
      sessionService: options.sessionService,
      onboardingService: options.onboardingService,
      cookieName,
    });
  }

  return app;
}
