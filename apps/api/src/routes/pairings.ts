import {
  pairingCloseRequestSchema,
  pairingCloseResultSchema,
  pairingJourneyViewSchema,
  pairingReadinessRequestSchema,
  pairingReadinessResultSchema,
  pairingRevealResultSchema,
  pairingConfirmResultSchema,
  pairingTogetherResultSchema,
  revealedCounterpartSchema,
} from "@kidan/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { SessionService } from "../auth/sessionService.js";
import { CompletionService, CompletionStateError } from "../completion/completionService.js";
import type { SessionRecord } from "../persistence/types.js";

interface PairingRouteOptions {
  sessionService: SessionService;
  completion: CompletionService;
  cookieName: string;
}

/**
 * Kidan Completion — candidate-facing pairing journey routes.
 *
 * The bot handles check-in pulses; these routes power the miniapp surfaces
 * from the product sketch (`docs/KIDAN_COMPLETION.md` §8): the "Next step"
 * card in chat, the primer + simultaneous confirm, the reveal success screen,
 * the stale-path resolution, and the closing ceremony.
 */
export const pairingRoutes: FastifyPluginAsync<PairingRouteOptions> = async (app, options) => {
  const requireSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SessionRecord | null> => {
    const session = await options.sessionService.authenticate(request.cookies[options.cookieName]);
    if (!session) {
      await reply.code(401).send({ error: { code: "UNAUTHENTICATED", requestId: request.id } });
      return null;
    }
    return session;
  };

  const requireCsrf = async (
    request: FastifyRequest,
    reply: FastifyReply,
    session: SessionRecord,
  ): Promise<boolean> => {
    const token = request.headers["x-csrf-token"];
    if (typeof token !== "string" || !options.sessionService.verifyCsrf(session, token)) {
      await reply.code(403).send({ error: { code: "CSRF_TOKEN_INVALID", requestId: request.id } });
      return false;
    }
    return true;
  };

  const sendError = (reply: FastifyReply, request: FastifyRequest, error: unknown) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }
    if (error instanceof CompletionStateError) {
      switch (error.code) {
        case "JOURNOTRACKED":
        case "CONNECTION_NOT_FOUND":
        case "NOT_PARTICIPANT":
          // Indistinguishable from "no such pairing" — never leak that an id exists.
          return reply.code(404).send({ error: { code: "PAIRING_NOT_FOUND", requestId: request.id } });
        case "PULSE_NOT_RESPONDABLE":
          return reply.code(409).send({ error: { code: error.code, requestId: request.id } });
        default:
          return reply.code(409).send({ error: { code: error.code, requestId: request.id } });
      }
    }
    throw error;
  };

  // The journey snapshot behind the chat view's persistent "Next step" card.
  app.get<{ Params: { connectionId: string } }>("/v1/pairings/:connectionId", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    try {
      const view = await options.completion.getJourneyView(request.params.connectionId, session.user.id);
      const validated = pairingJourneyViewSchema.safeParse(view);
      if (!validated.success) {
        request.log.error({ msg: "pairing view failed validation", error: validated.error.flatten() });
        return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
      }
      return reply.send({ data: validated.data });
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  // "Are you ready for the next step?" — the repeating readiness loop answer.
  app.post<{ Params: { connectionId: string } }>(
    "/v1/pairings/:connectionId/readiness",
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session || !(await requireCsrf(request, reply, session))) return;
      try {
        const parsed = pairingReadinessRequestSchema.parse(request.body);
        const result = await options.completion.answerReadiness(
          request.params.connectionId,
          session.user.id,
          parsed.answer,
          new Date(),
        );
        return reply.send({ data: pairingReadinessResultSchema.parse(result) });
      } catch (error) {
        return sendError(reply, request, error);
      }
    },
  );

  // Primer screen confirm — the second simultaneous confirmer triggers the reveal.
  app.post<{ Params: { connectionId: string } }>(
    "/v1/pairings/:connectionId/confirm",
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session || !(await requireCsrf(request, reply, session))) return;
      try {
        const result = await options.completion.confirmReveal(
          request.params.connectionId,
          session.user.id,
          new Date(),
        );
        if (result.revealed && result.counterpart) {
          return reply.send({
            data: pairingRevealResultSchema.parse({ revealed: true, counterpart: result.counterpart }),
          });
        }
        return reply.send({ data: pairingConfirmResultSchema.parse({ revealed: false }) });
      } catch (error) {
        return sendError(reply, request, error);
      }
    },
  );

  // Post-reveal: either side can re-read the unveiled identity (reveal success screen).
  app.get<{ Params: { connectionId: string } }>(
    "/v1/pairings/:connectionId/reveal",
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;
      try {
        const counterpart = await options.completion.getRevealedCounterpart(
          request.params.connectionId,
          session.user.id,
        );
        return reply.send({ data: revealedCounterpartSchema.parse(counterpart) });
      } catch (error) {
        return sendError(reply, request, error);
      }
    },
  );

  // Closing ceremony: respectful exit available at any stage.
  app.post<{ Params: { connectionId: string } }>(
    "/v1/pairings/:connectionId/close",
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session || !(await requireCsrf(request, reply, session))) return;
      try {
        const parsed = pairingCloseRequestSchema.parse(request.body ?? {});
        const result = await options.completion.requestClose(
          request.params.connectionId,
          session.user.id,
          new Date(),
          parsed.reason,
        );
        return reply.send({
          data: pairingCloseResultSchema.parse({ closed: true, followupDueAt: result.followupDueAt.toISOString() }),
        });
      } catch (error) {
        return sendError(reply, request, error);
      }
    },
  );

  // "Together" self-report (post-reveal win state).
  app.post<{ Params: { connectionId: string } }>(
    "/v1/pairings/:connectionId/together",
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session || !(await requireCsrf(request, reply, session))) return;
      try {
        await options.completion.reportTogether(request.params.connectionId, session.user.id, new Date());
        return reply.send({ data: pairingTogetherResultSchema.parse({ completedTogether: true }) });
      } catch (error) {
        return sendError(reply, request, error);
      }
    },
  );
};
