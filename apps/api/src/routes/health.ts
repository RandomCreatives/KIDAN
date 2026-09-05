import type { FastifyPluginAsync } from "fastify";

interface HealthRouteOptions {
  readinessCheck?: () => Promise<void>;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  // Root: a tiny service marker so that deployment verifiers, uptime probes,
  // and link previews that hit "/" get a 200 instead of a 404. This is NOT a
  // health/liveness signal — use /health and /ready for those.
  app.get("/", async () => ({
    data: { service: "kidan-api" },
  }));

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
