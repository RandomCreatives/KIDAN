import {
  connectionConfirmRequestSchema,
  connectionConfirmResponseSchema,
  connectionListResponseSchema,
} from "@kidan/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { SessionService } from "../auth/sessionService.js";
import type { ConnectionService } from "../connections/connectionService.js";
import type { SessionRecord } from "../persistence/types.js";

interface ConnectionRouteOptions {
  sessionService: SessionService;
  connectionService: ConnectionService;
  cookieName: string;
}

export const connectionRoutes: FastifyPluginAsync<ConnectionRouteOptions> = async (app, options) => {
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
      await reply.code(403).send({ error: { code: "INVALID_CSRF", requestId: request.id } });
      return false;
    }
    return true;
  };

  // The participant's connections (values-only; admin approval onward).
  app.get("/v1/connections", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const list = await options.connectionService.listForUser(session.user.id);
    const validated = connectionListResponseSchema.safeParse(list);
    if (!validated.success) {
      request.log.error({ msg: "connection list failed validation", error: validated.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: validated.data });
  });

  // Final participant confirmation/decline after admin approval.
  app.post<{ Params: { id: string } }>("/v1/connections/:id/confirm", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || !(await requireCsrf(request, reply, session))) return;
    try {
      const parsed = connectionConfirmRequestSchema.parse(request.body);
      const result = await options.connectionService.confirm(session.user.id, request.params.id, parsed.confirm);
      return reply.send({ data: connectionConfirmResponseSchema.parse(result) });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
      }
      if (error instanceof Error && error.message === "CONNECTION_NOT_FOUND") {
        return reply.code(404).send({ error: { code: "CONNECTION_NOT_FOUND", requestId: request.id } });
      }
      if (error instanceof Error && error.message === "REAL_SUBMISSIONS_DISABLED") {
        return reply.code(503).send({ error: { code: "REAL_SUBMISSIONS_DISABLED", requestId: request.id } });
      }
      throw error;
    }
  });
};
