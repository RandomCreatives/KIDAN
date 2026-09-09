/**
 * Resolve a candidate's onboarding/approval tier for the two-tier bot menu.
 *
 * Option A: the bot asks the API's internal, bearer-gated `/internal/bot-state`
 * endpoint, so it shows the right menu for NEW vs ACTIVE users without the bot
 * touching any user data or database itself. If the API is unreachable or the
 * secret is unset it fails open to 'new' (safe, conservative default).
 */

import type { MenuTier } from "./menu.js";

export interface TierResolverConfig {
  apiBaseUrl: string;
  botStateSecret: string;
  fetchFn?: typeof fetch;
}

export function createTierResolver(config: TierResolverConfig): (telegramUserId: number) => Promise<MenuTier> {
  const doFetch = config.fetchFn ?? fetch;
  return async (telegramUserId: number): Promise<MenuTier> => {
    try {
      const url = new URL("/internal/bot-state", config.apiBaseUrl);
      url.searchParams.set("telegramId", String(telegramUserId));
      const response = await doFetch(url.toString(), {
        method: "GET",
        headers: { authorization: `Bearer ${config.botStateSecret}` },
      });
      if (!response.ok) return "new";
      const body = (await response.json()) as { data?: { tier?: string } };
      return body.data?.tier === "active" ? "active" : body.data?.tier === "new" ? "new" : "new";
    } catch {
      // Fail open to the conservative "new" tier on any transport error.
      return "new";
    }
  };
}
