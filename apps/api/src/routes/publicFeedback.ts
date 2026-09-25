import { publicConcernSubmitRequestSchema, publicConcernSubmitResponseSchema } from "@kidan/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { FeedbackService } from "../feedback/feedbackService.js";

interface PublicFeedbackRouteOptions {
  feedbackService: FeedbackService;
  /** Browser origins allowed to call this endpoint cross-origin (the info hub). */
  allowedOrigins: string[];
}

/**
 * Public "Report a concern" endpoint for the standalone info hub (apps/info).
 *
 * Deliberately anonymous: no session, no CSRF cookie. Abuse pressure is handled
 * with three cheap barriers, chosen so legitimate reporters never notice them:
 *  1. CORS echo — only configured origins get browser-readable responses.
 *  2. Honeypot field — bots fill hidden inputs; humans don't. A filled honeypot
 *     returns a fake success (400-level response invites retries; silence invites
 *     escalation, so we just pretend it worked).
 *  3. Per-IP sliding-window throttle (in-process) as a last resort.
 *
 * The user-provided body is never logged; responses carry only the stored id.
 */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

export const publicFeedbackRoutes: FastifyPluginAsync<PublicFeedbackRouteOptions> = async (app, options) => {
  const hits = new Map<string, number[]>();

  const clientKey = (request: FastifyRequest): string => {
    // Vercel sets x-forwarded-for; request.ip already honours it when
    // trustProxy is enabled in the runtime (fall back gracefully if not).
    const fwd = request.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]!.trim();
    return request.ip ?? "unknown";
  };

  const throttled = (request: FastifyRequest): boolean => {
    const key = clientKey(request);
    const now = Date.now();
    const stamps = (hits.get(key) ?? []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (stamps.length >= RATE_LIMIT_MAX) {
      hits.set(key, stamps);
      return true;
    }
    stamps.push(now);
    hits.set(key, stamps);
    return false;
  };

  const corsOriginFor = (request: FastifyRequest): string | null => {
    const origin = request.headers.origin;
    if (origin && options.allowedOrigins.includes(origin)) return origin;
    return null;
  };

  const applyCors = (request: FastifyRequest, reply: FastifyReply): void => {
    const origin = corsOriginFor(request);
    if (!origin) return;
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
  };

  // Preflight for the cross-origin JSON POST from the info hub.
  app.options("/v1/public/feedback", async (request, reply) => {
    const origin = corsOriginFor(request);
    if (!origin) return reply.code(403).send();
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    reply.header("Access-Control-Max-Age", "86400");
    reply.header("Vary", "Origin");
    return reply.code(204).send();
  });

  app.post("/v1/public/feedback", async (request, reply) => {
    applyCors(request, reply);

    const parsed = publicConcernSubmitRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }

    // Honeypot tripped: pretend success so scrapers learn nothing.
    if (parsed.data.website && parsed.data.website.length > 0) {
      return reply.code(201).send({
        data: { id: "00000000-0000-0000-0000-000000000000", createdAt: new Date().toISOString() },
      });
    }

    if (throttled(request)) {
      return reply.code(429).send({ error: { code: "RATE_LIMITED", requestId: request.id } });
    }

    try {
      const created = await options.feedbackService.submitPublic({
        topic: parsed.data.topic,
        body: parsed.data.body,
        ...(parsed.data.contact ? { contact: parsed.data.contact } : {}),
      });
      const response = publicConcernSubmitResponseSchema.parse({
        id: created.id,
        createdAt: created.createdAt.toISOString(),
      });
      return reply.code(201).send({ data: response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "EMPTY_FEEDBACK") {
        return reply.code(422).send({ error: { code: "EMPTY_FEEDBACK", requestId: request.id } });
      }
      if (message === "FEEDBACK_TOO_LONG") {
        return reply.code(422).send({ error: { code: "FEEDBACK_TOO_LONG", requestId: request.id } });
      }
      if (message === "CONTACT_TOO_LONG") {
        return reply.code(422).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
      }
      throw error;
    }
  });
};
