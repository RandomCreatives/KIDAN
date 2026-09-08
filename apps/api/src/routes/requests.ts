import {
  incomingRequestsResponseSchema,
  introductionRequestCreateResponseSchema,
  introductionRequestCreateSchema,
  introductionRequestRespondResponseSchema,
  introductionRequestRespondSchema,
  outgoingRequestsResponseSchema,
} from "@kidan/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { SessionService } from "../auth/sessionService.js";
import type { RequestService } from "../requests/requestService.js";
import type { SessionRecord } from "../persistence/types.js";

interface RequestRouteOptions {
  sessionService: SessionService;
  requestService: RequestService;
  cookieName: string;
}

export const requestRoutes: FastifyPluginAsync<RequestRouteOptions> = async (app, options) => {
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

  const sendError = (reply: FastifyReply, request: FastifyRequest, error: unknown) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }
    if (error instanceof Error) {
      switch (error.message) {
        case "TARGET_NOT_FOUND":
        case "NOT_SHORTLISTED":
          return reply.code(404).send({ error: { code: error.message, requestId: request.id } });
        case "INTENTION_RATE_LIMIT":
          return reply.code(429).send({ error: { code: error.message, requestId: request.id } });
        case "REQUEST_ALREADY_EXISTS":
          return reply.code(409).send({ error: { code: error.message, requestId: request.id } });
        case "REQUEST_NOT_FOUND":
          return reply.code(404).send({ error: { code: error.message, requestId: request.id } });
        case "REAL_SUBMISSIONS_DISABLED":
          return reply.code(503).send({ error: { code: error.message, requestId: request.id } });
        default:
          break;
      }
    }
    throw error;
  };

  // Send a formal introduction request to a shortlisted target (≤5/rolling 24h).
  app.post("/v1/discovery/request", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || !(await requireCsrf(request, reply, session))) return;
    try {
      const parsed = introductionRequestCreateSchema.parse(request.body);
      const result = await options.requestService.sendRequest(session.user.id, parsed);
      return reply.send({ data: introductionRequestCreateResponseSchema.parse(result) });
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  // Pending requests addressed to the caller (sender's values-only summary).
  app.get("/v1/requests/incoming", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const result = await options.requestService.listIncoming(session.user.id);
    const validated = incomingRequestsResponseSchema.safeParse(result);
    if (!validated.success) {
      request.log.error({ msg: "incoming requests failed validation", error: validated.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: validated.data });
  });

  // The caller's sent requests (pending/accepted only; declines are invisible).
  app.get("/v1/requests/outgoing", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const result = await options.requestService.listOutgoing(session.user.id);
    const validated = outgoingRequestsResponseSchema.safeParse(result);
    if (!validated.success) {
      request.log.error({ msg: "outgoing requests failed validation", error: validated.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: validated.data });
  });

  // Recipient accepts or declines a pending request.
  app.post<{ Params: { id: string } }>("/v1/requests/:id/respond", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || !(await requireCsrf(request, reply, session))) return;
    try {
      const parsed = introductionRequestRespondSchema.parse(request.body);
      const result = await options.requestService.respond(session.user.id, request.params.id, parsed.accept);
      return reply.send({ data: introductionRequestRespondResponseSchema.parse(result) });
    } catch (error) {
      return sendError(reply, request, error);
    }
  });
};
