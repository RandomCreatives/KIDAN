import type { PairingPulseAnswer, PairingPulseRow } from "../persistence/types.js";

/**
 * Candidate pairing notifier (Kidan Completion, Phase 2).
 *
 * Delivers the scheduled pulses (readiness loop, weekly check-ins, stall
 * probes, closing follow-ups) to the candidate bot as Telegram messages with
 * inline answer buttons. Privacy contract (owner rule): messages carry no
 * names, phones, or identity details — the counterpart is referenced by
 * public code (K-XXXX) only, even after reveal.
 */

/** What the transport needs to render one pulse to one user. */
export interface PairingPulseNotification {
  pulse: PairingPulseRow;
  /** The OTHER participant's public code, for orientation (codes only). */
  counterpartCode: string;
}

export interface PairingNotifier {
  sendPulse(telegramUserId: bigint, notification: PairingPulseNotification): Promise<void>;
}

interface Button {
  text: string;
  answer: PairingPulseAnswer;
}

function copyFor(n: PairingPulseNotification): { text: string; buttons: Button[] } {
  const code = n.counterpartCode;
  const role = typeof n.pulse.context.role === "string" ? n.pulse.context.role : "";
  switch (n.pulse.kind) {
    case "readiness":
      return {
        text:
          "🌱 A quiet question from Kidan.\n\n"
          + `Your introduction with ${code} has grown through time and conversation. `
          + "Do you feel ready for the next step — to know each other fully?",
        buttons: [
          { text: "🌱 I'm ready", answer: "ready" },
          { text: "🕊 Not yet", answer: "not_yet" },
        ],
      };
    case "check_in":
      return {
        text:
          "💛 Checking in.\n\n"
          + `How is your journey with ${code} going? `
          + "Your answer stays private and helps Kidan walk with you well.",
        buttons: [
          { text: "💛 Going well", answer: "going_well" },
          { text: "🐢 Slowly, steadily", answer: "slow" },
          { text: "🍂 We're drifting", answer: "drifted" },
          { text: "🙏 We'd like guidance", answer: "guidance" },
          { text: "👋 Part ways", answer: "part" },
        ],
      };
    case "stall_probe":
      return role === "still_waiting_probe"
        ? {
            text:
              "🕊 From Kidan, gently.\n\n"
              + `${code} has been quiet for some time. You may keep waiting, `
              + "or close this path with dignity — either is honoured.",
            buttons: [
              { text: "🕊 Keep waiting", answer: "slow" },
              { text: "👋 Close this path", answer: "part" },
            ],
          }
        : {
            text:
              "🕊 A gentle nudge from Kidan.\n\n"
              + `${code} has been waiting to hear from you for a while. Silence leaves `
              + "a person in uncertainty — even a small message is an act of care.",
            buttons: [
              { text: "✍️ I'll write today", answer: "going_well" },
              { text: "👋 Close this path", answer: "part" },
            ],
          };
    case "closing_followup":
      return {
        text:
          "🌤 From Kidan, a few days later.\n\n"
          + "A path on Kidan recently closed. How are you doing? Your answer stays private.",
        buttons: [
          { text: "🌤 Doing well", answer: "well_after_close" },
          { text: "🙏 Grateful for it", answer: "grateful" },
          { text: "✍️ Share feedback", answer: "share_feedback" },
        ],
      };
  }
}

/** The callback payload embedded in each inline button (Telegram limit: 64 bytes). */
export function pairingCallbackData(pulseId: string, answer: PairingPulseAnswer): string {
  return `pair:${pulseId}:${answer}`;
}

export class TelegramPairingNotifier implements PairingNotifier {
  constructor(
    private readonly botToken: string,
    /** Base Mini App URL; when present, journey pulses get a deep-link CTA row. */
    private readonly miniAppUrl?: string,
  ) {}

  /** Deep link into the candidate's next-step screen for this connection. */
  private journeyUrl(connectionId: string): string | null {
    if (!this.miniAppUrl) return null;
    try {
      const url = new URL(this.miniAppUrl);
      url.searchParams.set("tab", "pairing");
      url.searchParams.set("connection", connectionId);
      url.searchParams.set("from", "bot");
      return url.toString();
    } catch {
      return null;
    }
  }

  async sendPulse(telegramUserId: bigint, notification: PairingPulseNotification): Promise<void> {
    const { text, buttons } = copyFor(notification);
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const keyboard: { text: string; callback_data?: string; web_app?: { url: string } }[][] = buttons.map((b) => [
        { text: b.text, callback_data: pairingCallbackData(notification.pulse.id, b.answer) },
      ]);
      // Journey-stage pulses (readiness/check-in/stall) get a deep link into
      // the Mini App next-step screen. The closing follow-up deliberately
      // does not: it closes over a path already decided.
      const journeyUrl =
        notification.pulse.kind === "closing_followup" ? null : this.journeyUrl(notification.pulse.connectionId);
      if (journeyUrl) {
        keyboard.push([
          {
            text: "🌱 Open your next step",
            web_app: { url: journeyUrl },
          },
        ]);
      }
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramUserId.toString(),
          text,
          protect_content: true,
          reply_markup: { inline_keyboard: keyboard },
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        // Never log the token (it is in the URL, which is not logged).
        console.error(`[kidan-api] pairing pulse failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[kidan-api] pairing pulse error", error instanceof Error ? error.message : "unknown");
    }
  }
}

/** Null-object notifier used when the candidate bot is not configured. */
export class NoopPairingNotifier implements PairingNotifier {
  async sendPulse(): Promise<void> {
    /* pairing notifications disabled */
  }
}
