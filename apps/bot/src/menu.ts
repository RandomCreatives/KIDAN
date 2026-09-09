/**
 * Bot inline-keyboard menu for @KidanAppBot.
 *
 * Everything here is:
 *  - privacy-safe: no name / photo / identity / contact detail ever appears
 *    in a button label, a message, or the callback data;
 *  - stateless: each handler returns the next message text + keyboard, and
 *    never stores user state (the two-tier choice is derived from the backend
 *    review status on every /start, see getMenuTier()).
 */

export type MenuTier = "new" | "active" | "all";

export type MenuAction =
  | { kind: "content"; key: ContentKey }
  | { kind: "open"; target: "launch" | "home" | "status" }
  | { kind: "report" }
  | { kind: "support" }
  | { kind: "back" };

export interface ButtonSpec {
  text: string;
  /** Telegram inline keyboard button, web_app or callback. */
  action: MenuAction;
}

interface Row {
  buttons: ButtonSpec[];
  /** true => full-width ("hero") button spanning the row. */
  hero?: boolean;
}

export type ContentKey = "how" | "rules" | "privacy" | "faq" | "status";

export const CONTENT: Record<ContentKey, { title: string; body: string }> = {
  how: {
    title: "How it works",
    body:
      "Kidan is a private, intentional way to meet Orthodox Christian " +
      "people. You build a profile, discover values-shot profiles (no photos, " +
      "no names), and only connect when you're both interested. Everything " +
      "personal stays inside the app and is never placed in this chat.",
  },
  rules: {
    title: "Rules",
    body:
      "Be honest and respectful. One profile per person. Profiles are " +
      "reviewed before they appear in discovery. Sharing contact details " +
      "(phone, Telegram, links) before an introduction is not allowed. We " +
      "may remove profiles that break these rules.",
  },
  privacy: {
    title: "Privacy notice",
    body:
      "Your legal name, phone, date of birth and verification photo are " +
      "encrypted and shown only to the operator who reviews your profile. " +
      "Discovery shows no photos or names. Connection identities are revealed " +
      "only after both of you confirm. You can export or delete your data at " +
      "any time from the app.",
  },
  faq: {
    title: "FAQ",
    body:
      "Q: Is this free? A: Yes, the pilot is free.\n" +
      "Q: What happens to my photo? A: It is private, deleted after review " +
      "or kept as a small thumbnail then removed 14 days after approval.\n" +
      "Q: How do I get help? A: Tap 'Support'.",
  },
  status: {
    title: "Your status",
    body:
      "This button is for active users. Tap it in the app menu or use " +
      "the Status entry to see your profile review state.",
  },
};

/**
 * Build the full-width ("hero") button for each tier. These open the Mini App
 * with a `start_param` deep-link so the app can route to the right screen.
 */
function heroFor(tier: MenuTier, appUrl: string): ButtonSpec {
  if (tier === "new") {
    return { text: "▶  Launch", action: { kind: "open", target: "launch" } };
  }
  return { text: "Open Kidan", action: { kind: "open", target: "home" } };
}

/** Rows for a given tier. Returns 2-column grids + a hero row. */
export function menuRows(tier: MenuTier, appUrl: string): Row[] {
  const rows: Row[] = [];

  if (tier === "new" || tier === "all") {
    rows.push(
      { buttons: [{ text: "How it works", action: { kind: "content", key: "how" } }] },
      {
        buttons: [
          { text: "Rules", action: { kind: "content", key: "rules" } },
          { text: "Privacy notice", action: { kind: "content", key: "privacy" } },
        ],
      },
    );
  }

  if (tier === "active" || tier === "all") {
    rows.push(
      {
        buttons: [
          { text: "Status", action: { kind: "content", key: "status" } },
          { text: "Support", action: { kind: "support" } },
        ],
      },
    );
  }

  if (tier === "all") {
    rows.push(
      {
        buttons: [
          { text: "Rules", action: { kind: "content", key: "rules" } },
          { text: "Privacy notice", action: { kind: "content", key: "privacy" } },
        ],
      },
    );
  }

  // FAQ + Report a concern: always available.
  rows.push({
    buttons: [
      { text: "FAQ", action: { kind: "content", key: "faq" } },
      { text: "Report a concern", action: { kind: "report" } },
    ],
  });

  rows.push({ buttons: [heroFor(tier, appUrl)], hero: true });
  return rows;
}

export const START_TEXT =
  "Welcome to Kidan — private, intentional Orthodox Christian " +
  "introductions. Your identity and profile details never appear here.\n\n" +
  "Choose below:";

/** Build the greeting text + keyboard for a tier. */
export function startPayload(tier: MenuTier, appUrl: string) {
  return { text: START_TEXT, rows: menuRows(tier, appUrl) };
}
