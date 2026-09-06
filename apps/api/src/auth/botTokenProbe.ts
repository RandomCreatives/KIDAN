// Verifies the configured bot token against Telegram's getMe once per function
// instance and caches the result. Only non-secret identity is returned; the
// token itself is never logged or returned.

export interface BotTokenProbeResult {
  ok: boolean;
  id?: number;
  username?: string;
  reason?: string;
}

let cached: BotTokenProbeResult | null = null;
let inFlight: Promise<BotTokenProbeResult> | null = null;

export async function probeBotToken(botToken: string): Promise<BotTokenProbeResult> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<BotTokenProbeResult> => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const body = await res.json() as {
        ok?: boolean;
        result?: { id?: number; username?: string };
        description?: string;
      };
      if (body.ok && body.result) {
        const result: BotTokenProbeResult = { ok: true };
        if (body.result.id !== undefined) result.id = body.result.id;
        if (body.result.username !== undefined) result.username = body.result.username;
        cached = result;
      } else {
        cached = { ok: false, reason: body.description ?? "rejected" };
      }
    } catch (error) {
      cached = { ok: false, reason: error instanceof Error ? error.message : "probe failed" };
    }
    return cached;
  })();
  return inFlight;
}
