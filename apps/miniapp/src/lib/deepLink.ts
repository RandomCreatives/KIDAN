/**
 * Deep-link support for the Mini App.
 *
 * The bot's hero buttons open the Mini App with a query string (e.g.
 * `?tab=onboarding&from=bot` or `?tab=status`). This module reads that target
 * so the app can land on the right screen instead of always defaulting home.
 *
 * Source is the current URL query (works in Telegram webview, which preserves
 * the hash/query of the web_app URL) and, in real Telegram, `initDataUnsafe`
 * start_param where available. It never reads or exposes identity data.
 */

export type DeepLinkTab = "onboarding" | "discover" | "connections" | "profile" | "status" | "pairing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readTargetTab(from: string | null | undefined): DeepLinkTab | null {
  if (!from) return null;
  const tab = from.toLowerCase();
  if (
    tab === "onboarding" ||
    tab === "discover" ||
    tab === "connections" ||
    tab === "profile" ||
    tab === "status" ||
    tab === "pairing"
  ) {
    return tab;
  }
  return null;
}

/** Read the target tab from a URL (search string) for localStorage/URL-based sources. */
export function readTargetTabFromUrl(url: string): DeepLinkTab | null {
  try {
    const parsed = new URL(url);
    return readTargetTab(parsed.searchParams.get("tab"));
  } catch {
    return null;
  }
}

/**
 * Read a pairing-journey focus from a bot deep link
 * (`?tab=pairing&connection=<uuid>&from=bot`), sent with journey pulses so
 * candidates land directly on their next-step screen. The connection id is
 * a non-secret UUID; the pairing API always authenticates the session and
 * never exposes data for connections the user does not belong to.
 */
export function readPairingFocusFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (readTargetTab(parsed.searchParams.get("tab")) !== "pairing") return null;
    const connection = parsed.searchParams.get("connection");
    return connection && UUID_PATTERN.test(connection) ? connection : null;
  } catch {
    return null;
  }
}
