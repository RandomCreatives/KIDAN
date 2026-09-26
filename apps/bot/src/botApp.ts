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
import { CONTENT, menuRows, START_TEXT, type ContentKey, type MenuAction, type MenuTier } from "./menu.js";
import { parsePairingCallback, GENERIC_ACK, type PairingAnswerer } from "./pairingCallbacks.js";

export type TierResolver = (telegramUserId: number) => Promise<MenuTier>;

export const DEFAULT_INFO_BASE_URL = "https://kidan-staging-info.vercel.app";

export interface BotConfig {
  token: string;
  miniAppUrl: string;
  /** Resolve a user's onboarding/approval tier. Injected so the bot stays DB-free. */
  resolveTier: TierResolver;
  /** Kidan Completion: apply pairing pulse answers via the API. When absent,
   *  pulse callbacks still clear gracefully with a generic ack. */
  answerPairing?: PairingAnswerer | undefined;
  /** Base URL of the standalone public info hub (https://…). When set, the
   *  legacy short-note menu buttons (how/rules/privacy/faq) are swapped in
   *  place for URL buttons opening the hub's full pages. */
  infoBaseUrl?: string | undefined;
}

/** Info-hub page paths for each linkable button. */
/** Hub pages linkable from the menu (every ContentKey except "status", which
 *  has no hub page and stays a short note). */
type InfoPageKey = Exclude<ContentKey, "status">;

/** Info-hub page paths for each linkable button. */
const INFO_LINKS: Record<InfoPageKey | "report", string> = {
  how: "how-it-works.html",
  rules: "rules.html",
  privacy: "privacy.html",
  faq: "faq.html",
  report: "report.html",
};

/** Legacy short-note content keys the hub now covers with full pages. These
 *  buttons get swapped in place for URL buttons when the hub is linked; the
 *  `status` note, `support`, and the guided in-bot "Report a concern" flow
 *  stay native (no hub equivalents — the web report form serves people
 *  outside Telegram). */
const INFO_PAGE_KEYS: readonly InfoPageKey[] = ["how", "rules", "privacy", "faq"];
const INFO_PAGE_KEY_SET: ReadonlySet<ContentKey> = new Set(INFO_PAGE_KEYS);

function isInfoPageKey(key: ContentKey): key is InfoPageKey {
  return INFO_PAGE_KEY_SET.has(key);
}

function infoUrl(base: string, page: string): string {
  return `${base.replace(/\/+$/, "")}/${page}`;
}

/** URL rows (2-wide) for any hub pages this tier's own rows did not already
 *  link in place — e.g. the active tier omits the new-user explainer buttons.
 *  Labels come from CONTENT so swapped and appended buttons stay identical. */
function infoRows(kb: InlineKeyboard, infoBaseUrl: string, missing: readonly InfoPageKey[]): void {
  for (let i = 0; i < missing.length; i += 2) {
    const line = kb.row();
    for (const key of missing.slice(i, i + 2)) {
      line.webApp(CONTENT[key].title, infoUrl(infoBaseUrl, INFO_LINKS[key]));
    }
  }
}

/** Build the keyboard rows (as grammY InlineKeyboard) for a tier.
 *  Rows with a hero button become a single full-width web_app button. When the
 *  info hub is linked, legacy short-note buttons covered by hub pages become
 *  URL buttons IN PLACE (same labels, same positions) — hubs pages a tier
 *  lacks are appended as extra URL rows. */
export function keyboardFor(tier: MenuTier, miniAppUrl: string, infoBaseUrl?: string): InlineKeyboard {
  const effectiveInfoBaseUrl = infoBaseUrl === undefined ? DEFAULT_INFO_BASE_URL : infoBaseUrl;
  const kb = new InlineKeyboard();
  const rows = menuRows(tier, miniAppUrl);
  const swapped = new Set<InfoPageKey>();
  let appended = false;
  const appendMissing = (): void => {
    if (!appended && effectiveInfoBaseUrl) infoRows(kb, effectiveInfoBaseUrl, INFO_PAGE_KEYS.filter((k) => !swapped.has(k)));
    appended = true;
  };
  for (const row of rows) {
    const button = row.buttons[0];
    if (row.hero && button) {
      // menuRows always pushes the hero last, so `swapped` is final here:
      // appended hub links go ABOVE the web_app call-to-action.
      appendMissing();
      const target = button.action.kind === "open" ? button.action.target : "home";
      kb.row().webApp(button.text, miniAppUrlFor(miniAppUrl, target));
    } else {
      const line = kb.row();
      for (const button of row.buttons) {
        const key = button.action.kind === "content" ? button.action.key : undefined;
        if (effectiveInfoBaseUrl && key && isInfoPageKey(key)) {
          swapped.add(key);
          line.webApp(button.text, infoUrl(effectiveInfoBaseUrl, INFO_LINKS[key]));
        } else if (effectiveInfoBaseUrl && button.action.kind === "report") {
          line.webApp(button.text, infoUrl(effectiveInfoBaseUrl, INFO_LINKS["report"]));
        } else {
          line.text(button.text, `kidan:${JSON.stringify(button.action)}`);
        }
      }
    }
  }
  appendMissing();
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
export function contentReply(action: MenuAction, tier: MenuTier, miniAppUrl: string, infoBaseUrl?: string): { text: string; kb: InlineKeyboard } {
  if (action.kind === "content") {
    const c = CONTENT[action.key];
    const title = c?.title ?? "";
    const body = c?.body ?? "";
    return { text: `${title}\n\n${body}`, kb: keyboardFor(tier, miniAppUrl, infoBaseUrl) };
  }
  if (action.kind === "open") {
    return {
      text: "Tap below to open Kidan.",
      kb: keyboardFor(tier, miniAppUrl, infoBaseUrl),
    };
  }
  if (action.kind === "report") {
    return {
      text:
        "Please describe your concern briefly. Type it and send, or open the " +
        "app for more help. Your message goes to the Kidan operator and is " +
        "handled privately.",
      kb: keyboardFor(tier, miniAppUrl, infoBaseUrl),
    };
  }
  if (action.kind === "support") {
    return {
      text:
        "For help, open the app or reply here with your question. The operator " +
        "reviews messages privately.",
      kb: keyboardFor(tier, miniAppUrl, infoBaseUrl),
    };
  }
  if (action.kind === "back") {
    return { text: START_TEXT, kb: keyboardFor(tier, miniAppUrl, infoBaseUrl) };
  }
  return { text: START_TEXT, kb: keyboardFor(tier, miniAppUrl, infoBaseUrl) };
}

export function createBot(config: BotConfig): Bot {
  const { token, miniAppUrl, resolveTier, infoBaseUrl } = config;
  const bot = new Bot(token);

  bot.command("start", async (context) => {
    const from = context.from;
    const tier: MenuTier = from ? await resolveTier(from.id) : "all";
    await context.reply(START_TEXT, {
      reply_markup: keyboardFor(tier, miniAppUrl, infoBaseUrl),
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
    const data = context.callbackQuery.data;
    // Kidan Completion: pairing pulse answers are forwarded to the API and the
    // message is replaced by the (privacy-safe) acknowledgement. Omitting
    // reply_markup removes the buttons so a tapped pulse cannot re-fire.
    const pairing = parsePairingCallback(data);
    if (pairing) {
      await context.answerCallbackQuery();
      const from = context.from;
      const ack = from && config.answerPairing
        ? await config.answerPairing(from.id, pairing.pulseId, pairing.answer)
        : GENERIC_ACK;
      await context.editMessageText(ack);
      return;
    }

    const resolved = parseAction(data);
    // Always answer the callback so Telegram doesn't show a spinner.
    await context.answerCallbackQuery();
    if (!resolved) return;

    const from = context.from;
    const tier: MenuTier = from ? await resolveTier(from.id) : "all";
    const reply = contentReply(resolved, tier, miniAppUrl, infoBaseUrl);

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
