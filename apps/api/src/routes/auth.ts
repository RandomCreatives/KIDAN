import { sessionStatusSchema, telegramAuthRequestSchema, telegramAuthResponseSchema } from "@kidan/contracts";
import type { FastifyPluginAsync } from "fastify";
import { SessionAccessError, type SessionService } from "../auth/sessionService.js";
import { TelegramValidationError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { probeBotToken } from "../auth/botTokenProbe.js";

export interface AuthRouteOptions {
  botToken: string;
  sessionService: SessionService;
  cookieName: string;
  secureCookies: boolean;
  // When false (production default), the non-secret diagnostics below are
  // still recorded in server logs but are never sent to the client.
  exposeDiagnostics: boolean;
  // Server-side pilot switch surfaced to the Mini App so it only offers real
  // submission when the deployment accepts it.
  realSubmissionsEnabled?: boolean;
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
      const response = telegramAuthResponseSchema.safeParse({
        authenticated: true,
        csrfToken: issued.csrfToken,
        profileStatus: issued.profileStatus,
        expiresAt: issued.expiresAt.toISOString(),
        ...(options.realSubmissionsEnabled ? { realSubmissionsEnabled: true } : {}),
      });
      if (!response.success) {
        request.log.error({ msg: "telegram auth response failed contract validation", error: response.error.flatten() });
        return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
      }
      return reply.code(200).send({ data: response.data });
    } catch (error) {
      if (error instanceof TelegramValidationError) {
        // Log the rejection reason plus the configured bot's numeric id (the
        // digits before ':' in the token — a public bot user id, never the
        // secret). initData/body are redacted by the logger config.
        const configuredBotId = options.botToken.includes(":") ? options.botToken.split(":")[0] : "malformed-token";
        // Live-verify the token against Telegram (cached) so the cause is
        // visible in server logs. The result is non-secret but, together with
        // the configured bot id, is only returned to the client when
        // diagnostics are exposed (non-production). Production/staging
        // deployments log these server-side and send only the error code.
        const tokenProbe = await probeBotToken(options.botToken);
        request.log.warn(
          { reason: error.code, configuredBotId, tokenProbe },
          "telegram init data rejected",
        );
        return reply.code(401).send({
          error: {
            code: error.code,
            requestId: request.id,
            ...(options.exposeDiagnostics ? { configuredBotId, tokenProbe } : {}),
          },
        });
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
    const response = sessionStatusSchema.safeParse({
      authenticated: true,
      csrfToken: restored.csrfToken,
      profileStatus: restored.profileStatus,
      expiresAt: restored.expiresAt.toISOString(),
      ...(options.realSubmissionsEnabled ? { realSubmissionsEnabled: true } : {}),
    });
    if (!response.success) {
      request.log.error({ msg: "session status response failed contract validation", error: response.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: response.data });
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
