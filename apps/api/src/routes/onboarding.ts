import {
  draftResponseSchema,
  draftSaveResponseSchema,
  INITIAL_ONBOARDING_STEP,
  ONBOARDING_SCHEMA_VERSION,
  onboardingProgressPatchSchema,
  onboardingSubmitRequestSchema,
  onboardingSubmitResponseSchema,
} from "@kidan/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { SessionService } from "../auth/sessionService.js";
import type { OnboardingService } from "../onboarding/onboardingService.js";
import type { DraftRecord, SessionRecord } from "../persistence/types.js";
import { SubmissionStateError, VersionConflictError } from "../persistence/types.js";

interface OnboardingRouteOptions {
  sessionService: SessionService;
  onboardingService: OnboardingService;
  cookieName: string;
}

export const onboardingRoutes: FastifyPluginAsync<OnboardingRouteOptions> = async (app, options) => {
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

  const sendDomainError = async (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", requestId: request.id } });
    }
    if (error instanceof VersionConflictError) {
      return reply.code(409).send({ error: { code: "DRAFT_VERSION_CONFLICT", requestId: request.id } });
    }
    if (error instanceof SubmissionStateError) {
      const allowedCodes = new Set([
        "REAL_SUBMISSIONS_DISABLED",
        "DRAFT_NOT_FOUND",
        "DRAFT_ALREADY_SUBMITTED",
        "IDENTITY_INCOMPLETE",
        "ADULT_ELIGIBILITY_REQUIRED",
        "VERIFICATION_PHOTO_REQUIRED",
        "VERIFICATION_PHOTO_INVALID",
      ]);
      const code = allowedCodes.has(error.message) ? error.message : "INVALID_ONBOARDING_STATE";
      const status = code === "REAL_SUBMISSIONS_DISABLED" ? 503 : 409;
      return reply.code(status).send({ error: { code, requestId: request.id } });
    }
    throw error;
  };

  app.get("/v1/onboarding/draft", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    let draft: DraftRecord | null;
    let identityComplete: boolean;
    let photoComplete: boolean;
    try {
      [draft, identityComplete, photoComplete] = await Promise.all([
        options.onboardingService.getDraft(session.user.id),
        options.onboardingService.hasCompletePrivateIdentity(session.user.id),
        options.onboardingService.hasVerificationPhoto(session.user.id),
      ]);
    } catch (error) {
      if (error instanceof ZodError) {
        request.log.error({ msg: "persisted draft failed contract validation", error: error.flatten() });
        return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
      }
      throw error;
    }
    const responseData = draft
      ? {
          schemaVersion: draft.schemaVersion,
          currentStep: draft.currentStep,
          payload: draft.publicPayload,
          version: draft.version,
          submitted: Boolean(draft.submittedAt),
          identityComplete,
          photoComplete,
        }
      : {
          schemaVersion: ONBOARDING_SCHEMA_VERSION,
          currentStep: INITIAL_ONBOARDING_STEP,
          payload: {},
          version: 0,
          submitted: false,
          identityComplete,
          photoComplete,
        };
    const validated = draftResponseSchema.safeParse(responseData);
    if (!validated.success) {
      request.log.error({ msg: "draft response failed contract validation", error: validated.error.flatten() });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
    }
    return reply.send({ data: validated.data });
  });

  app.put("/v1/onboarding/draft", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || !(await requireCsrf(request, reply, session))) return;
    try {
      const progress = onboardingProgressPatchSchema.parse(request.body);
      const saved = await options.onboardingService.saveProgress(session.user.id, progress);
      const responseData = { version: saved.version, currentStep: saved.currentStep };
      const validated = draftSaveResponseSchema.safeParse(responseData);
      if (!validated.success) {
        request.log.error({ msg: "draft save response failed contract validation", error: validated.error.flatten() });
        return reply.code(500).send({ error: { code: "INTERNAL_ERROR", requestId: request.id } });
      }
      return reply.send({ data: validated.data });
    } catch (error) {
      return sendDomainError(error, request, reply);
    }
  });

  app.put("/v1/onboarding/private-identity", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || !(await requireCsrf(request, reply, session))) return;
    try {
      await options.onboardingService.savePrivateIdentity(session.user.id, request.body);
      return reply.code(204).send();
    } catch (error) {
      return sendDomainError(error, request, reply);
    }
  });

  app.put(
    "/v1/onboarding/verification-photo",
    { config: { bodyLimit: 6 * 1024 * 1024 } },
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session || !(await requireCsrf(request, reply, session))) return;
      try {
        await options.onboardingService.saveVerificationPhoto(session.user.id, request.body);
        return reply.code(204).send();
      } catch (error) {
        return sendDomainError(error, request, reply);
      }
    },
  );

  app.post("/v1/onboarding/submit", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session || !(await requireCsrf(request, reply, session))) return;
    try {
      const submission = onboardingSubmitRequestSchema.parse(request.body);
      await options.onboardingService.submit(session.user.id, submission);
      const response = onboardingSubmitResponseSchema.parse({ status: "profile_pending" });
      return reply.code(202).send({ data: response });
    } catch (error) {
      return sendDomainError(error, request, reply);
    }
  });
};
