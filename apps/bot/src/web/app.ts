/**
 * Serverless bot entry (Vercel / Node function).
 *
 * Composes the grammY bot with the injected Option-A tier resolver and exposes
 * a Telegram webhook endpoint. Deployed from `main` like the other services.
 *
 * A dedicated function route (`web/app.ts`) is used so the bot's long-polling
 * `index.ts` can remain for an always-on host; only one should run at a time.
 */

import { createBot } from "../botApp.js";
import { createTierResolver } from "../tierResolver.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const miniAppUrl = process.env.MINI_APP_URL;
const apiBaseUrl = process.env.BOT_API_URL;
const botStateSecret = process.env.BOT_STATE_SECRET;

if (!token || !miniAppUrl) {
  throw new Error("TELEGRAM_BOT_TOKEN and MINI_APP_URL are required for the webhook.");
}

const resolveTier =
  apiBaseUrl && botStateSecret ? createTierResolver({ apiBaseUrl, botStateSecret }) : async () => "new" as const;

// NOTE: module scope runs once per warm function instance.
const bot = createBot({ token, miniAppUrl, resolveTier });

// grammY provides the raw Node req/res webhook handler.
import { webhookCallback } from "grammy";
export default webhookCallback(bot, "http");
