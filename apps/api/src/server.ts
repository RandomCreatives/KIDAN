import { buildApp } from "./app.js";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const app = await buildApp({
  logger: true,
  ...(botToken ? { botToken } : {}),
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
