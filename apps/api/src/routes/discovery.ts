import {
  discoveryDecisionRequestSchema,
  discoveryDecisionResponseSchema,
  discoveryFeedResponseSchema,
} from "@kidan/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { SessionService } from "../auth/sessionService.js";
import type { DiscoveryService } from "../discovery/discoveryService.js";
import type { SessionRecord } from "../persistence/types.js";

interface DiscoveryRouteOptions {
  sessionService: SessionService;
  discoveryService: DiscoveryService;
  cookieName: string;
}

export const discoveryRoutes: FastifyPluginAsync<DiscoveryRouteOptions> = async (app, options) => {
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

  // Values-only discovery feed (no identity/photo).
  app.get("/v1/discovery/feed", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const feed = await options.discoveryService.getFeed(session.user.id);
    const validated = discoveryFeedResponseSchema.safeParse(feed);
    if (!validated.success) {
      request.log.error({ msg: "discovery feed failed validation", error: validated.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: validated.data });
  });

  // Record a pass/interested decision.
  app.post("/v1/discovery/decision", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || !(await requireCsrf(request, reply, session))) return;
    try {
      const parsed = discoveryDecisionRequestSchema.parse(request.body);
      await options.discoveryService.recordDecision(session.user.id, parsed);
      return reply.send({ data: discoveryDecisionResponseSchema.parse({ recorded: true }) });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
      }
      if (error instanceof Error && error.message === "TARGET_NOT_FOUND") {
        return reply.code(404).send({ error: { code: "TARGET_NOT_FOUND", requestId: request.id } });
      }
      if (error instanceof Error && error.message === "REAL_SUBMISSIONS_DISABLED") {
        return reply.code(503).send({ error: { code: "REAL_SUBMISSIONS_DISABLED", requestId: request.id } });
      }
      throw error;
    }
  });
};
