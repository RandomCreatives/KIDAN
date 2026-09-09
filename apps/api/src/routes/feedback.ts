import {
  feedbackSubmitRequestSchema,
  feedbackSubmitResponseSchema,
} from "@kidan/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { SessionService } from "../auth/sessionService.js";
import type { FeedbackService } from "../feedback/feedbackService.js";
import type { SessionRecord } from "../persistence/types.js";

interface FeedbackRouteOptions {
  sessionService: SessionService;
  feedbackService: FeedbackService;
  cookieName: string;
}

export const feedbackRoutes: FastifyPluginAsync<FeedbackRouteOptions> = async (app, options) => {
  const requireSession = async (request: FastifyRequest, reply: FastifyReply): Promise<SessionRecord | null> => {
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

  const sendFeedbackError = async (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }
    if (typeof error === "object" && error !== null && "message" in error && error.message === "EMPTY_FEEDBACK") {
      return reply.code(422).send({ error: { code: "EMPTY_FEEDBACK", requestId: request.id } });
    }
    if (typeof error === "object" && error !== null && "message" in error && error.message === "FEEDBACK_TOO_LONG") {
      return reply.code(422).send({ error: { code: "FEEDBACK_TOO_LONG", requestId: request.id } });
    }
    throw error;
  };

  app.post("/v1/feedback", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    if (!(await requireCsrf(request, reply, session))) return;

    const parsed = feedbackSubmitRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }

    try {
      const publicCode = await options.feedbackService.publicCodeFor(session.user.id);
      if (!publicCode) {
        return reply.code(409).send({ error: { code: "PROFILE_NOT_READY", requestId: request.id } });
      }
      const created = await options.feedbackService.submit({
        userId: session.user.id,
        publicCode,
        kind: parsed.data.kind,
        body: parsed.data.body,
      });
      const response = feedbackSubmitResponseSchema.safeParse({
        id: created.id,
        kind: parsed.data.kind,
        createdAt: created.createdAt.toISOString(),
      });
      if (!response.success) throw response.error;
      return reply.code(201).send({ data: response.data });
    } catch (error) {
      return sendFeedbackError(error, request, reply);
    }
  });
};
