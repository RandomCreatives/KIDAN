import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    data: {
      status: "ok",
      service: "kidan-api",
      timestamp: new Date().toISOString(),
    },
  }));
};
