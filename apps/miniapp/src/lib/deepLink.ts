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

export type DeepLinkTab = "onboarding" | "discover" | "connections" | "profile" | "status";

export function readTargetTab(from: string | null | undefined): DeepLinkTab | null {
  if (!from) return null;
  const tab = from.toLowerCase();
  if (
    tab === "onboarding" ||
    tab === "discover" ||
    tab === "connections" ||
    tab === "profile" ||
    tab === "status"
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
