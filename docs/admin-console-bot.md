# Operator admin-console bot (separate bot for the admin)

The operator (you) gets a **dedicated admin bot** — separate from the candidate
bot `@KidanAppBot` — so you can review and approve submissions from your phone
without opening a PC.

## What it does
- Sends privacy-safe notifications to the operator's chat:
  - `new_submission` — "New submission KD-XXXX is awaiting review."
  - `connection_pending_admin` — "A matched pair is awaiting your approval."
- Each message carries a **"Open console"** button that opens the **admin console
  inside Telegram as a Mini App** (the in-chat browser), where you sign in with
  the **admin password** and see the verification photo + Approve / Reject /
  Request-changes controls.

## Privacy boundary (hard rule)
The bot carries **only** a public code and the console link. It **never** sends a
candidate's name, phone number, verification photo, Telegram username, or any
profile detail. Identity/photo review remains inside the admin console (HTTPS,
admin-auth), which the bot simply opens. This keeps the
"no identity/photo via bot transport" rule intact.

## Enabling it
Set all three on the **API** Vercel project (absent → the notifier is a no-op):

| Var | Value |
|---|---|
| `ADMIN_BOT_TOKEN` | Token of the **new** admin bot (from @BotFather) — do NOT reuse the candidate bot token |
| `ADMIN_CHAT_ID` | Your numeric Telegram chat id (the id the bot messages) |
| `ADMIN_CONSOLE_URL` | HTTPS URL of the admin console (e.g. `https://kidan-staging-admin.vercel.app`) |

> `ADMIN_CONSOLE_PASSWORD` must still be set (the console's login password).
> `ADMIN_ORIGIN` should already allow the console URL.

## Capturing the operator chat id
1. Create/open the new admin bot; send it `/start`.
2. Either read the `chat.id` from the bot's `/getMe`-adjacent webhook + latest
   update, or set `ADMIN_CHAT_ID` to the numeric id (Telegram's `chat.id` for a
   private chat is the user id; easiest: run the bot, then use the Bot API
   `/getUpdates` once to read `message.chat.id`).

## Mini App note
Telegram opens a `web_app` button's URL in its in-app browser. Any public HTTPS
URL works. The admin console is already reachable on a phone browser, so no
special Mini App wrapper is required for the pilot.

## What is intentionally not included (yet)
- `health_degraded` notifications (the type exists; wiring into the monitor is a
  follow-up). UptimeRobot remains the independent "is the site up" watchdog.
- Sending the verification photo into the bot (deliberately excluded — privacy).
