import type { FastifyPluginAsync } from "fastify";

interface HealthRouteOptions {
  readinessCheck?: () => Promise<void>;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  app.get("/", async () => ({
    data: {
      status: "ok",
      service: "kidan-api",
      timestamp: new Date().toISOString(),
    },
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
    } catch {
      return reply.code(503).send({
        error: { code: "SERVICE_NOT_READY", requestId: request.id },
      });
    }
  });
};
