import Fastify from "fastify";
import { buildRuntimeApp, loadLocalEnvironmentFile } from "./runtimeApp.js";

loadLocalEnvironmentFile();
// Pass the direct Fastify import through so Vercel's static framework detector
// and the runtime use the same factory.
const { app } = await buildRuntimeApp(process.env, Fastify);
await app.ready();

// Vercel's Node runtime requires a recognized entrypoint to default-export
// a request handler or Node server. Fastify owns and configures this server.
export default app.server;
