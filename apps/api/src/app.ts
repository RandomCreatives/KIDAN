import { buildRuntimeApp, loadLocalEnvironmentFile } from "./runtimeApp.js";

loadLocalEnvironmentFile();
const { app } = await buildRuntimeApp();
await app.ready();

// Vercel's Node runtime requires a recognized entrypoint to default-export
// a request handler or Node server. Fastify owns and configures this server.
export default app.server;