/**
 * One-time (idempotent) webhook registration for @KidanAppBot.
 *
 * Called once after the serverless bot is deployed (e.g. via a deploy hook or
 * a manual fetch) to point Telegram at ${BOT_WEBHOOK_URL}. Idempotent — safe
 * to call repeatedly. Requires BOT_WEBHOOK_URL and TELEGRAM_BOT_TOKEN.
 */

import { createBot, type BotConfig } from "../src/botApp.js";
import { createTierResolver } from "../src/tierResolver.js";
import { registerWebhook } from "../src/webhook.js";

export default async function register(_req: unknown, res: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.BOT_WEBHOOK_URL;
  const miniAppUrl = process.env.MINI_APP_URL;
  const apiBaseUrl = process.env.BOT_API_URL;
  const botStateSecret = process.env.BOT_STATE_SECRET;

  if (!token || !webhookUrl || !miniAppUrl) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN, BOT_WEBHOOK_URL and MINI_APP_URL required" }));
    return;
  }

  const config: BotConfig = {
    token,
    miniAppUrl,
    resolveTier:
      apiBaseUrl && botStateSecret
        ? createTierResolver({ apiBaseUrl, botStateSecret })
        : async () => "new" as const,
  };
  const bot = createBot(config);
  try {
    await registerWebhook(bot, webhookUrl);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, webhookUrl }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "unknown" }));
  }
}
