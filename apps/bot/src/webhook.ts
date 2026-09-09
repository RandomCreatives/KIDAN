/**
 * Serverless webhook adapter for @KidanAppBot.
 *
 * Lets the same `createBot()` run on a serverless/platform function (Vercel,
 * Cloudflare, etc.) via Telegram webhooks, so there is no always-on process to
 * babysit. Build the bot once, then hand `webhookCallback` to the host.
 *
 * The host must call `registerWebhook()` once (it persists the webhook URL on
 * Telegram). After that Telegram pushes updates to `WEBHOOK_CALLBACK`.
 */

import { webhookCallback } from "grammy";
import type { Bot } from "grammy";

/** Returns the grammY webhook handler (Node http.Request/Response style).
 *  Uses the built-in "http" adapter — works as a standalone Vercel/serverless
 *  Node function and express-style hosts, no framework package required.
 *  Telegram pushes updates here via webhooks; see registerWebhook(). */
export function webhookHandler(bot: Bot) {
  return webhookCallback(bot, "http");
}

/** Register the webhook URL with Telegram (idempotent; call on boot). */
export async function registerWebhook(bot: Bot, webhookUrl: string): Promise<void> {
  await bot.api.setWebhook(webhookUrl, {
    drop_pending_updates: true,
    allowed_updates: ["message", "callback_query"],
  });
}

/** Unset the webhook so a long-polling process can take over (dev). */
export async function unsetWebhook(bot: Bot): Promise<void> {
  await bot.api.deleteWebhook({ drop_pending_updates: true });
}
