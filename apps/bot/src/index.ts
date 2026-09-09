/**
 * Long-polling entry for @KidanAppBot (dev / always-on host).
 *
 * The two-tier menu and handlers live in `botApp.ts`; this entry simply composes
 * createBot() with the Option-A tier resolver and starts long polling. For a
 * serverless (Vercel) deployment use `web/app.ts` instead — do not run both.
 */

import { createBot } from "./botApp.js";
import { createTierResolver } from "./tierResolver.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const miniAppUrl = process.env.MINI_APP_URL;
const apiBaseUrl = process.env.BOT_API_URL;
const botStateSecret = process.env.BOT_STATE_SECRET;

if (!token || !miniAppUrl) {
  console.error("TELEGRAM_BOT_TOKEN and MINI_APP_URL are required to start the bot.");
  process.exit(1);
}

const resolveTier =
  apiBaseUrl && botStateSecret
    ? createTierResolver({ apiBaseUrl, botStateSecret })
    : async () => "new" as const;

const bot = createBot({ token, miniAppUrl, resolveTier });

bot.start({ onStart: () => console.info("Kidan bot started") });
