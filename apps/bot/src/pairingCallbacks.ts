/**
 * Pairing pulse callback bridge (Kidan Completion, Phase 2).
 *
 * The API delivers scheduled pulses (readiness prompts, weekly check-ins,
 * stall probes, closing follow-ups) as bot messages whose inline buttons
 * carry `pair:<pulseId>:<answer>` callback payloads. The bot must stay
 * DB-free, so it forwards the tap to the API's bearer-gated
 * /internal/pairing/answer endpoint and edits the message with the returned
 * (privacy-safe) acknowledgement. On any failure the ack stays warm and
 * generic — never an error stack, never identity detail.
 */

export interface PairingCallback {
  pulseId: string;
  answer: string;
}

/** Parse `pair:<pulseId>:<answer>` payloads; null for anything else. */
export function parsePairingCallback(data: string): PairingCallback | null {
  if (!data.startsWith("pair:")) return null;
  const rest = data.slice("pair:".length);
  const separator = rest.lastIndexOf(":");
  if (separator <= 0) return null;
  const pulseId = rest.slice(0, separator);
  const answer = rest.slice(separator + 1);
  if (pulseId.length === 0 || pulseId.length > 64) return null;
  if (answer.length === 0 || answer.length > 40) return null;
  return { pulseId, answer };
}

/** Applies a pulse answer for a Telegram user; resolves to the ack text. */
export type PairingAnswerer = (telegramUserId: number, pulseId: string, answer: string) => Promise<string>;

export const GENERIC_ACK = "💛 Noted — thank you.";

export function createPairingAnswerer(config: {
  apiBaseUrl: string;
  botStateSecret: string;
  fetchFn?: typeof fetch;
}): PairingAnswerer {
  const doFetch = config.fetchFn ?? fetch;
  return async (telegramUserId, pulseId, answer) => {
    try {
      const response = await doFetch(new URL("/internal/pairing/answer", config.apiBaseUrl).toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.botStateSecret}`,
        },
        body: JSON.stringify({ telegramId: telegramUserId, pulseId, answer }),
      });
      if (response.status === 409) {
        // Already answered (double-tap or answered on another device).
        return "This check-in was already answered — thank you.";
      }
      if (!response.ok) return GENERIC_ACK;
      const body = (await response.json()) as { data?: { text?: string } };
      return body.data?.text ?? GENERIC_ACK;
    } catch {
      return "💛 Thank you — if this did not register, you can answer again inside Kidan.";
    }
  };
}
