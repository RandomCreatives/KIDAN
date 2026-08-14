import { telegramAuthRequestSchema } from "@kidan/contracts";
import type { FastifyPluginAsync } from "fastify";
import { SessionAccessError, type SessionService } from "../auth/sessionService.js";
import { TelegramValidationError, validateTelegramInitData } from "../auth/telegramInitData.js";

export interface AuthRouteOptions {
  botToken: string;
  sessionService: SessionService;
  cookieName: string;
  secureCookies: boolean;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.post("/v1/auth/telegram", async (request, reply) => {
    const parsed = telegramAuthRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }

    try {
      const principal = validateTelegramInitData(parsed.data.initData, { botToken: options.botToken });
      const issued = await options.sessionService.issueForTelegramUser(
        principal.telegramUserId,
        principal.authDate,
      );
      reply.setCookie(options.cookieName, issued.sessionToken, {
        path: "/",
        httpOnly: true,
        secure: options.secureCookies,
        sameSite: "strict",
        maxAge: Math.max(1, Math.floor((issued.expiresAt.getTime() - Date.now()) / 1000)),
      });
      return reply.code(200).send({
        data: {
          authenticated: true,
          csrfToken: issued.csrfToken,
          profileStatus: issued.profileStatus,
          expiresAt: issued.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof TelegramValidationError) {
        return reply.code(401).send({ error: { code: error.code, requestId: request.id } });
      }
      if (error instanceof SessionAccessError) {
        return reply.code(403).send({ error: { code: "ACCOUNT_UNAVAILABLE", requestId: request.id } });
      }
      throw error;
    }
  });

  app.get("/v1/session", async (request, reply) => {
    const token = request.cookies[options.cookieName];
    const restored = await options.sessionService.restoreSession(token);
    if (!restored) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", requestId: request.id } });
    return reply.send({
      data: {
        authenticated: true,
        csrfToken: restored.csrfToken,
        profileStatus: restored.profileStatus,
        expiresAt: restored.expiresAt.toISOString(),
      },
    });
  });

  app.post("/v1/session/logout", async (request, reply) => {
    const token = request.cookies[options.cookieName];
    const session = await options.sessionService.authenticate(token);
    if (!session) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", requestId: request.id } });
    const csrfToken = request.headers["x-csrf-token"];
    if (typeof csrfToken !== "string" || !options.sessionService.verifyCsrf(session, csrfToken)) {
      return reply.code(403).send({ error: { code: "INVALID_CSRF", requestId: request.id } });
    }
    await options.sessionService.revoke(token!);
    reply.clearCookie(options.cookieName, { path: "/" });
    return reply.code(204).send();
  });
};
