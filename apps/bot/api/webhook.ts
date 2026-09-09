/**
 * Vercel serverless webhook entry for @KidanAppBot.
 *
 * Telegram pushes updates to `${BOT_WEBHOOK_URL}` (configured once via
 * registerWebhook). This function handles them. Builds the bot each warm
 * invocation with the Option-A tier resolver injected.
 *
 * Env (set on the Vercel bot project):
 *  - TELEGRAM_BOT_TOKEN
 *  - MINI_APP_URL
 *  - BOT_API_URL  (base of the Kidan API, e.g. https://kidan-staging-api.vercel.app)
 *  - BOT_STATE_SECRET (must match the API's BOT_STATE_SECRET)
 */

import { createBot, type BotConfig } from "../src/botApp.js";
import { createTierResolver } from "../src/tierResolver.js";
import { webhookCallback } from "grammy";

function buildBot(): ReturnType<typeof createBot> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const miniAppUrl = process.env.MINI_APP_URL;
  const apiBaseUrl = process.env.BOT_API_URL;
  const botStateSecret = process.env.BOT_STATE_SECRET;

  if (!token || !miniAppUrl) {
    throw new Error("TELEGRAM_BOT_TOKEN and MINI_APP_URL are required for the webhook.");
  }

  const config: BotConfig = {
    token,
    miniAppUrl,
    resolveTier:
      apiBaseUrl && botStateSecret
        ? createTierResolver({ apiBaseUrl, botStateSecret })
        : async () => "new" as const,
  };
  return createBot(config);
}

// grammY's "http" adapter yields a Node (req, res) handler suitable for Vercel.
const handler = webhookCallback(buildBot(), "http");

// Vercel Node function signature: (req, res).
export default handler;
