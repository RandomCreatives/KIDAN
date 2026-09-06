import {
  adminConnectionDecisionRequestSchema,
  adminConnectionDecisionResponseSchema,
  adminDecisionRequestSchema,
  adminIntroductionListSchema,
  adminDecisionResponseSchema,
  adminLoginRequestSchema,
  adminPendingConnectionListSchema,
  adminPhotoResponseSchema,
  adminQueueResponseSchema,
  adminSessionSchema,
  adminSubmissionDetailSchema,
} from "@kidan/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { AdminSessionService } from "../auth/adminSessionService.js";
import { AdminDecisionError, AdminService } from "../admin/adminService.js";
import type { ConnectionService } from "../connections/connectionService.js";

interface AdminRouteOptions {
  adminSession: AdminSessionService;
  adminService: AdminService;
  connectionService?: ConnectionService;
  cookieName: string;
  secureCookies: boolean;
}

export const adminRoutes: FastifyPluginAsync<AdminRouteOptions> = async (app, options) => {
  const requireAdmin = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ csrfToken: string } | null> => {
    const token = request.cookies[options.cookieName];
    const session = options.adminSession.authenticate(token);
    if (!session) {
      await reply.code(401).send({ error: { code: "UNAUTHENTICATED", requestId: request.id } });
      return null;
    }
    return session;
  };

  const requireCsrf = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const token = request.cookies[options.cookieName];
    const csrf = request.headers["x-csrf-token"];
    if (!options.adminSession.verifyCsrf(token, typeof csrf === "string" ? csrf : undefined)) {
      await reply.code(403).send({ error: { code: "INVALID_CSRF", requestId: request.id } });
      return false;
    }
    return true;
  };

  const sendAdminError = (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AdminDecisionError) {
      const allowed = new Set([
        "SUBMISSION_NOT_FOUND",
        "SUBMISSION_NOT_PENDING",
        "FEEDBACK_REQUIRED",
        "IDENTITY_UNAVAILABLE",
      ]);
      const code = allowed.has(error.message) ? error.message : "ADMIN_ACTION_FAILED";
      const status = code === "SUBMISSION_NOT_FOUND" ? 404 : code === "FEEDBACK_REQUIRED" ? 422 : 409;
      return reply.code(status).send({ error: { code, requestId: request.id } });
    }
    throw error;
  };

  app.post("/v1/admin/session", async (request, reply) => {
    const parsed = adminLoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }
    if (!options.adminSession.verifyPassword(parsed.data.password)) {
      // Same generic code whether the password is wrong or the body malformed,
      // to avoid leaking which usernames exist (there is just one operator).
      return reply.code(401).send({ error: { code: "INVALID_ADMIN_CREDENTIALS", requestId: request.id } });
    }
    const issued = options.adminSession.issue();
    reply.setCookie(options.cookieName, issued.sessionToken, {
      path: "/",
      httpOnly: true,
      secure: options.secureCookies,
      sameSite: "strict",
      maxAge: Math.max(1, Math.floor((issued.expiresAt.getTime() - Date.now()) / 1000)),
    });
    const response = adminSessionSchema.safeParse({
      authenticated: true,
      csrfToken: issued.csrfToken,
      label: options.adminSession.label,
    });
    if (!response.success) {
      request.log.error({ msg: "admin session response failed contract validation", error: response.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: response.data });
  });

  app.get("/v1/admin/session", async (request, reply) => {
    const session = options.adminSession.authenticate(request.cookies[options.cookieName]);
    if (!session) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", requestId: request.id } });
    const response = adminSessionSchema.safeParse({
      authenticated: true,
      csrfToken: session.csrfToken,
      label: options.adminSession.label,
    });
    if (!response.success) {
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: response.data });
  });

  app.post("/v1/admin/session/logout", async (request, reply) => {
    const session = await requireAdmin(request, reply);
    if (!session) return;
    if (!(await requireCsrf(request, reply))) return;
    reply.clearCookie(options.cookieName, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/v1/admin/submissions", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const items = await options.adminService.listQueue();
    const response = adminQueueResponseSchema.safeParse({ items });
    if (!response.success) {
      request.log.error({ msg: "admin queue response failed contract validation", error: response.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: response.data });
  });

  app.get<{ Params: { publicCode: string } }>("/v1/admin/submissions/:publicCode", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    try {
      const detail = await options.adminService.getSubmission(request.params.publicCode);
      if (!detail) {
        return reply.code(404).send({ error: { code: "SUBMISSION_NOT_FOUND", requestId: request.id } });
      }
      const response = adminSubmissionDetailSchema.safeParse(detail);
      if (!response.success) {
        request.log.error({ msg: "admin detail response failed contract validation", error: response.error.flatten() });
        return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
      }
      return reply.send({ data: response.data });
    } catch (error) {
      return sendAdminError(error, request, reply);
    }
  });

  app.get<{ Params: { publicCode: string } }>("/v1/admin/submissions/:publicCode/photo", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const photo = await options.adminService.getPhoto(request.params.publicCode);
    if (!photo) {
      return reply.code(404).send({ error: { code: "PHOTO_NOT_FOUND", requestId: request.id } });
    }
    const dataUrl = `data:${photo.mediaType};base64,${photo.bytes.toString("base64")}`;
    const response = adminPhotoResponseSchema.safeParse({ mediaType: photo.mediaType, dataUrl });
    if (!response.success) {
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: response.data });
  });

  app.post<{ Params: { publicCode: string } }>("/v1/admin/submissions/:publicCode/decision", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;
    const parsed = adminDecisionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }
    try {
      const decision = await options.adminService.decide(request.params.publicCode, parsed.data);
      const response = adminDecisionResponseSchema.parse({ decision, reviewStatus: decision });
      return reply.send({ data: response });
    } catch (error) {
      return sendAdminError(error, request, reply);
    }
  });

  // Track D: mutually-interested pairs awaiting administrator approval.
  app.get("/v1/admin/connections", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!options.connectionService) {
      return reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    }
    const pending = await options.connectionService.listPending();
    const response = adminPendingConnectionListSchema.safeParse(pending);
    if (!response.success) {
      request.log.error({ msg: "admin connections response failed validation", error: response.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: response.data });
  });

  app.post<{ Params: { id: string } }>("/v1/admin/connections/:id/decision", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;
    if (!options.connectionService) {
      return reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    }
    const parsed = adminConnectionDecisionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }
    try {
      const result = await options.connectionService.decide(request.params.id, parsed.data.decision === "approved");
      return reply.send({ data: adminConnectionDecisionResponseSchema.parse(result) });
    } catch (error) {
      if (error instanceof Error && error.message === "CONNECTION_NOT_PENDING") {
        return reply.code(404).send({ error: { code: "CONNECTION_NOT_PENDING", requestId: request.id } });
      }
      throw error;
    }
  });

  // Track D3: moderation of the restricted in-app introduction channel.
  app.get("/v1/admin/introductions", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!options.connectionService) {
      return reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    }
    const recent = await options.connectionService.listRecentMessages();
    const response = adminIntroductionListSchema.safeParse(recent);
    if (!response.success) {
      request.log.error({ msg: "admin introductions response failed validation", error: response.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: response.data });
  });

  app.post<{ Params: { messageId: string } }>("/v1/admin/introductions/:messageId/hide", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;
    if (!options.connectionService) {
      return reply.code(503).send({ error: { code: "SERVICE_NOT_READY", requestId: request.id } });
    }
    try {
      await options.connectionService.hideMessage(request.params.messageId);
      return reply.send({ data: { hidden: true } });
    } catch (error) {
      if (error instanceof Error && error.message === "MESSAGE_NOT_FOUND") {
        return reply.code(404).send({ error: { code: "MESSAGE_NOT_FOUND", requestId: request.id } });
      }
      throw error;
    }
  });
};
