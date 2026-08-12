import Fastify, { type FastifyInstance } from "fastify";
import type { TelegramSessionStore } from "./persistence/sessionStore.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";

export interface BuildAppOptions {
  botToken?: string;
  logger?: boolean;
  sessionStore?: TelegramSessionStore;
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
              "req.body",
              "res.headers['set-cookie']",
            ],
            censor: "[REDACTED]",
          },
        }
      : false,
    bodyLimit: 32 * 1024,
    requestIdHeader: false,
    genReqId: () => crypto.randomUUID(),
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.addHook("onClose", async () => {
    await options.sessionStore?.close?.();
  });

  await app.register(healthRoutes);

  if (options.botToken) {
    await app.register(authRoutes, {
      botToken: options.botToken,
      ...(options.sessionStore ? { sessionStore: options.sessionStore } : {}),
    });
  }

  return app;
}
