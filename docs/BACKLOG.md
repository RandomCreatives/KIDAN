# Kidan — Shared Idea / Backlog

Purpose: capture features to **add / remove / test / maintain** so nothing is lost.
Items are **not final or "done"** until the user has tested them on-device and approved.
Keep narrative brief; record decisions and status.

Legend: `[idea]` proposed, `[planned]` scoped/confirmed, `[building]` in progress, `[shipped]` live & user-signed-off, `[blocked]` needs a decision/info.

---

## Bot inline-keyboard menu (`@KidanAppBot`) — `[shipped: part 1]`

**Shipped (PR #30, merge `3dcb639`):** two-tier menu + serverless webhook adapter + Mini App deep-link.
Bot tests 12/12; miniapp deep-link 3/3; all CI green; staging fast-forwarded & healthy.

**Goal.** Make the bot friendly and familiar with a Telegram inline-keyboard menu
(2-column button grid + full-width hero button + Back), like a typical store bot.
**No name / photo / identity ever appears in a button or message** (standing privacy
constraint). Two-tier menu chosen by the user's profile state (Option A: bot queries the
backend).

### New user (joined, not yet approved)
- How it works  (callback → in-chat text)
- Rules          (callback → in-chat text)
- Privacy Notice (callback → in-chat text)
- FAQ            (callback → in-chat text)
- Report a concern (callback → operator)
- **▶ Launch** (full-width `web_app` → Mini App onboarding)

### Active user (approved)
- **Status** (callback → own approval state: Approved / In review / Changes needed / Rejected)
- Support       (callback → operator)
- FAQ           (callback → in-chat text)
- Report a concern (callback → operator)
- **Open Kidan**  (full-width `web_app` → Mini App)

### Confirmations from user (all "as recommended")
1. **Report a concern → goes to the operator (admin).** New concern feed → admin bot.
   Admin console gets a **top hamburger menu** to list **all concerns** (new/read states).
2. **Status = the user's own approval state** (approvals / rejections / in-review / changes).
3. **Option A** — bot queries the backend for profile status to pick menu; enables `Status`.

### Feedback / concerns + real bot status — `[shipped: part 2]`
**Shipped (PR #31, merge `87209bc` + PR #32, merge `0c20579`):** feedback feed
(table 0008) + candidate `POST /v1/feedback` + admin `GET /v1/admin/feedback`
(401 gated live) + admin hamburger drawer + mini-app Feedback & help screen +
real bot tier via `/internal/bot-state` + **operator ping on new report** +
**serverless webhook hosting** for `@KidanAppBot`.
Tests: api 166, bot 16, miniapp 137, admin 8. All live & healthy.

### Remaining (env/config actions — operator)
- **Set `BOT_STATE_SECRET`** on the API env project (so `/internal/bot-state`
  registers; without it the endpoint is intentionally 404).
- **Create the bot Vercel project** and set `TELEGRAM_BOT_TOKEN`, `MINI_APP_URL`,
  `BOT_API_URL`, `BOT_STATE_SECRET`, `BOT_WEBHOOK_URL`; then call `/api/register`
  once to point Telegram at the webhook.
- **Switch `@KidanAppBot` from long-polling to the webhook** (stop the always-on
  host once the webhook is live) — recommended; only one should run at a time.

---

## Earlier shipped work (reference, settled unless user revisits)
- **Funnel redesign** — `PR #27` (merged `546bc9e`), mobile fixes `PR #28` (merge `28da804`),
  stat descriptions fit inside boxes `PR #29` (merge `f086d77`). All live & staged.
- Mobile corrections: summary fits screen, **fixed bottom tab nav**, no empty detail/placeholder
  card, stat boxes stack value→name→description (smaller font).

---

## Standing project criteria (do not regress)
- Publication patches `.txt`. No payments/credits/wallet/ratings/VIP/paid verification.
- Pilot is free. Discovery is photo-less & name-less. Verification photo is private and
  purged (thumbnail-only after approval, 14 days). Fastify 5.12.3. Audit 0.
- Never log tokens / DB URLs / cookies / keys. Anonymity preserved. Merge commit, not squash;
  CI green; both services redeployed via Vercel hooks after merge.
