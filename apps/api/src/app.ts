import Fastify from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildRuntimeApp, loadLocalEnvironmentFile } from "./runtimeApp.js";

loadLocalEnvironmentFile();

const { app } = await buildRuntimeApp(process.env, Fastify);
await app.ready();

const server = app.server;

// Vercel deploys this package as a Node.js serverless function. The runtime
// invokes the default export with Node's raw (IncomingMessage, ServerResponse)
// pair, which we forward into Fastify's request pipeline. We keep a single
// ready Fastify instance per cold start instead of binding a listening port.
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (res.writableEnded) return;
  await new Promise<void>((resolve, reject) => {
    res.once("finish", resolve);
    res.once("error", reject);
    server.emit("request", req, res);
  });
}
