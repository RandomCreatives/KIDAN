/**
 * Bot factory for @KidanAppBot.
 *
 * This module builds the grammY `Bot` with all handlers, but does NOT start
 * polling or bind to any server. That keeps it deployment-agnostic:
 *  - `index.ts` runs it via long polling (dev / always-on host), and
 *  - `webhook.ts` adapts it to a serverless trigger (Vercel / cloud function).
 *
 * Every dependency is injected so the handlers are unit-testable and so the
 * bot never touches the DB itself (privacy + single-responsibility).
 */

import { Bot, InlineKeyboard } from "grammy";
import { CONTENT, menuRows, START_TEXT, type MenuAction, type MenuTier } from "./menu.js";

export type TierResolver = (telegramUserId: number) => Promise<MenuTier>;

export interface BotConfig {
  token: string;
  miniAppUrl: string;
  /** Resolve a user's onboarding/approval tier. Injected so the bot stays DB-free. */
  resolveTier: TierResolver;
}

/** Build the keyboard rows (as grammY InlineKeyboard) for a tier.
 *  Rows with a hero button become a single full-width web_app button. */
function keyboardFor(tier: MenuTier, miniAppUrl: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  const rows = menuRows(tier, miniAppUrl);
  for (const row of rows) {
    const button = row.buttons[0];
    if (row.hero && button) {
      const target = button.action.kind === "open" ? button.action.target : "home";
      kb.row().webApp(button.text, miniAppUrlFor(miniAppUrl, target));
    } else {
      const line = kb.row();
      for (const button of row.buttons) {
        line.text(button.text, `kidan:${JSON.stringify(button.action)}`);
      }
    }
  }
  return kb;
}

/** Append a deep-link query param so the Mini App can route to the right screen. */
export function miniAppUrlFor(base: string, target: "launch" | "home" | "status"): string {
  const url = new URL(base);
  const tab = target === "launch" ? "onboarding" : target === "status" ? "status" : "discover";
  url.searchParams.set("tab", tab);
  url.searchParams.set("from", "bot");
  return url.toString();
}

/** Parse the callback payloads we emit (return null for anything unexpected). */
export function parseAction(data: string): MenuAction | null {
  if (!data.startsWith("kidan:")) return null;
  try {
    const parsed = JSON.parse(data.slice("kidan:".length)) as MenuAction;
    if (parsed && typeof parsed === "object" && "kind" in parsed) return parsed;
  } catch {
    // malformed -> ignore
  }
  return null;
}

/** Reply text for a content action (How/Rules/Privacy/FAQ/Status/Back). */
export function contentReply(action: MenuAction, tier: MenuTier, miniAppUrl: string): { text: string; kb: InlineKeyboard } {
  if (action.kind === "content") {
    const c = CONTENT[action.key];
    const title = c?.title ?? "";
    const body = c?.body ?? "";
    return { text: `${title}\n\n${body}`, kb: keyboardFor(tier, miniAppUrl) };
  }
  if (action.kind === "open") {
    return {
      text: "Tap below to open Kidan.",
      kb: keyboardFor(tier, miniAppUrl),
    };
  }
  if (action.kind === "report") {
    return {
      text:
        "Please describe your concern briefly. Type it and send, or open the " +
        "app for more help. Your message goes to the Kidan operator and is " +
        "handled privately.",
      kb: keyboardFor(tier, miniAppUrl),
    };
  }
  if (action.kind === "support") {
    return {
      text:
        "For help, open the app or reply here with your question. The operator " +
        "reviews messages privately.",
      kb: keyboardFor(tier, miniAppUrl),
    };
  }
  if (action.kind === "back") {
    return { text: START_TEXT, kb: keyboardFor(tier, miniAppUrl) };
  }
  return { text: START_TEXT, kb: keyboardFor(tier, miniAppUrl) };
}

export function createBot(config: BotConfig): Bot {
  const { token, miniAppUrl, resolveTier } = config;
  const bot = new Bot(token);

  bot.command("start", async (context) => {
    const from = context.from;
    const tier: MenuTier = from ? await resolveTier(from.id) : "all";
    await context.reply(START_TEXT, {
      reply_markup: keyboardFor(tier, miniAppUrl),
      protect_content: true,
    });
  });

  bot.command("privacy", async (context) => {
    await context.reply(
      "Kidan notifications are generic. Names, phone numbers, profile details, and " +
        "connection identities are shown only inside the secured app when authorized.",
      { protect_content: true },
    );
  });

  bot.on("callback_query:data", async (context) => {
    const resolved = parseAction(context.callbackQuery.data);
    // Always answer the callback so Telegram doesn't show a spinner.
    await context.answerCallbackQuery();
    if (!resolved) return;

    const from = context.from;
    const tier: MenuTier = from ? await resolveTier(from.id) : "all";
    const reply = contentReply(resolved, tier, miniAppUrl);

    const isEdit = resolved.kind !== "report" && resolved.kind !== "support";
    if (isEdit) {
      // editMessageText has no protect_content option; content stays generic.
      await context.editMessageText(reply.text, { reply_markup: reply.kb });
    } else {
      // Report/Support are replies; protect from forwarding.
      await context.reply(reply.text, { reply_markup: reply.kb, protect_content: true });
    }
  });

  // Never log update payloads; they may contain user attributes or messages.
  bot.catch((error) => {
    console.error("Bot update failed", {
      error: error.error instanceof Error ? error.error.message : "unknown",
    });
  });

  return bot;
}
