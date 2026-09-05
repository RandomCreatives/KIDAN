import type { FastifyPluginAsync } from "fastify";

interface HealthRouteOptions {
  readinessCheck?: () => Promise<void>;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  app.get("/health", async () => ({
    data: {
      status: "ok",
      service: "kidan-api",
      timestamp: new Date().toISOString(),
    },
  }));

  app.get("/ready", async (request, reply) => {
    try {
      if (options.readinessCheck) await options.readinessCheck();
      return reply.send({ data: { status: "ready", service: "kidan-api" } });
    } catch (error) {
      // Log enough to diagnose server-side (missing table, privilege, or
      // divergent DDL) without returning any internal detail to the client.
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
      const message = error instanceof Error ? error.message : "unknown readiness error";
      request.log.error({ code, errorName: error instanceof Error ? error.name : "UnknownError" }, `readiness check failed: ${message}`);
      return reply.code(503).send({
        error: { code: "SERVICE_NOT_READY", requestId: request.id },
      });
    }
  });
};
