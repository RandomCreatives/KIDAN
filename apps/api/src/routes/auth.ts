import { randomUUID } from "node:crypto";
import { telegramAuthRequestSchema } from "@kidan/contracts";
import type { FastifyPluginAsync } from "fastify";
import { TelegramValidationError, validateTelegramInitData } from "../auth/telegramInitData.js";

interface AuthRouteOptions {
  botToken: string;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.post("/v1/auth/telegram/verify", async (request, reply) => {
    const parsed = telegramAuthRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }

    try {
      validateTelegramInitData(parsed.data.initData, { botToken: options.botToken });

      // Persistence is intentionally the next milestone. Do not place Telegram IDs
      // into a client token or response. Exchange validation for an opaque DB-backed
      // session before using this route for real authentication.
      return reply.code(200).send({
        data: {
          validated: true,
          requestId: randomUUID(),
          sessionReady: false,
        },
      });
    } catch (error) {
      if (error instanceof TelegramValidationError) {
        return reply.code(401).send({ error: { code: error.code, requestId: request.id } });
      }
      throw error;
    }
  });
};
