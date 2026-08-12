import { randomUUID } from "node:crypto";
import { telegramAuthRequestSchema } from "@kidan/contracts";
import type { FastifyPluginAsync } from "fastify";
import { TelegramValidationError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { AccountUnavailableError, type TelegramSessionStore } from "../persistence/sessionStore.js";

interface AuthRouteOptions {
  botToken: string;
  sessionStore?: TelegramSessionStore;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.post("/v1/auth/telegram/verify", async (request, reply) => {
    const parsed = telegramAuthRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }

    try {
      const principal = validateTelegramInitData(parsed.data.initData, { botToken: options.botToken });

      if (!options.sessionStore) {
        return reply.code(200).send({
          data: {
            validated: true,
            requestId: randomUUID(),
            sessionReady: false,
          },
        });
      }

      const session = await options.sessionStore.createTelegramSession({
        telegramUserId: principal.telegramUserId,
        authDate: principal.authDate,
      });

      return reply.code(200).send({
        data: {
          validated: true,
          requestId: randomUUID(),
          sessionReady: true,
          session: {
            token: session.sessionToken,
            principal: session.principal,
          },
        },
      });
    } catch (error) {
      if (error instanceof TelegramValidationError) {
        return reply.code(401).send({ error: { code: error.code, requestId: request.id } });
      }
      if (error instanceof AccountUnavailableError) {
        return reply.code(403).send({ error: { code: "ACCOUNT_UNAVAILABLE", requestId: request.id } });
      }
      throw error;
    }
  });
};
