# Kidan — Staging Acceptance Checklist

Use after the bot/serverless deploy. Tick each box; note any failure with the exact
screen/button and what you saw.

**Environment**

| Service | URL |
|---|---|
| Mini App | https://kidan-staging-app.vercel.app |
| API | https://kidan-staging-api.vercel.app |
| Admin console | https://kidan-staging-admin.vercel.app |
| Bot (serverless) | https://kidan-staging-bot.vercel.app |
| Bot webhook | https://kidan-staging-bot.vercel.app/api/webhook |
| Bot handle | @KidanAppBot |

**Test date:** ____________  **Tester:** ____________  **Verdict:** PASS / FAIL

---

## 0. Pre-flight (infra, no device needed)

- [ ] `GET https://kidan-staging-api.vercel.app/ready` → **200**
- [ ] `GET https://kidan-staging-app.vercel.app/` → **200**
- [ ] `GET https://kidan-staging-admin.vercel.app/` → **200**
- [ ] `GET https://kidan-staging-bot.vercel.app/api/register` → `{"ok":true,"webhookUrl":".../api/webhook"}`
      _(not a Fastify `NOT_FOUND` — that would mean the old API build is still serving)_
- [ ] `GET https://kidan-staging-api.vercel.app/v1/admin/feedback` → **401** (gated, not 404)
- [ ] Vercel: bot project's latest production deploy on the current `main` SHA is **READY**

## 1. Delivery mode (only ONE at a time)

- [ ] No local/always-on long-polling `npm run dev:bot` process is running
- [ ] Telegram delivers updates to the webhook (not getUpdates) — confirmed by a live reply
- [ ] `drop_pending_updates` behavior: no duplicate/replayed old messages after deploy

## 2. Bot — first contact (`/start`)

- [ ] Send `/start` → greeting appears ("Welcome to Kidan — private, intentional…")
- [ ] Message renders with the **2-column icon/label button grid** + full-width hero button
- [ ] Keyboard matches the reference screenshot layout (rows, hero spans full width)
- [ ] Buttons present for a **new** user: "How it works", "Rules", "Privacy notice", "FAQ",
      "Report a concern", and hero **"▶ Launch"**
- [ ] Buttons present for an **active** user (post-approval): "Status", "Support", "Rules",
      "Privacy notice", "FAQ", "Report a concern", hero **"Open Kidan"**
- [ ] `/privacy` command replies with the generic privacy line
- [ ] Sending a free-text message to the bot does **not** echo or leak anything

## 3. Bot — inline button behavior

- [ ] Tap **"How it works"** → message **edits in place** (no new message spam)
- [ ] Tap **"Rules"** / **"Privacy notice"** → edits in place with correct copy
- [ ] Tap **"FAQ"** → edits in place
- [ ] Tap **"Status"** → correct active-user copy
- [ ] Tap **"Support"** → replies as a **new** message (not an edit)
- [ ] Tap **"Report a concern"** → replies as a **new** message
- [ ] Every tap shows **no spinner hang** (callback always answered)
- [ ] **Back-ish flow:** after Support/Report, the previous keyboard/back returns to menu
- [ ] Tap hero **"▶ Launch"** → opens the Mini App (new user)
- [ ] Tap hero **"Open Kidan"** → opens the Mini App **routed to the right screen** (active user)
- [ ] Repeatedly tapping buttons does not throw errors (no "Bot update failed" in logs)

## 4. 🔒 Privacy rule (the hard gate)

For every bot message and every button label seen above, confirm **none** contains:

- [ ] No legal/real **name**
- [ ] No **phone number** (or phone-like digit run)
- [ ] No **@handle** / `t.me` / `telegram.me` / URL
- [ ] No profile details (DOB, city-of-origin identity, photo, verification status detail)
- [ ] No other person's identity or connection identity
- [ ] Report/Support replies never echo the user's own private details back
- [ ] Bot messages use `protect_content` (forward/save disabled) — check the UI affordance

## 5. Mini App — onboarding (new candidate)

- [ ] Launch Mini App from the bot hero button → opens via Telegram (not a browser prompt)
- [ ] Telegram login / session bootstrap succeeds (no "Session expired" loop)
- [ ] Faith questions + **21–45 age gate** + marriage "either" branch all present
- [ ] Onboarding draft saves and **resumes** after closing/reopening
- [ ] Submit a real profile (behind `ENABLE_REAL_SUBMISSIONS=true`) → success state
- [ ] Verification photo upload accepts a real photo (incl. HEIC / gallery pick)
- [ ] Photo upload failure shows a **precise** error, not a generic failure
- [ ] Consent receipt shown on submit
- [ ] Pilot capacity: a new submission when cohort is full returns `PILOT_CAPACITY_REACHED`
      (only test if you deliberately fill the cap)

## 6. Mini App — core loop (approved candidate)

- [ ] Discovery feed is **values-only**: public code (KD-XXXXXX), age, city, gender,
      values, bio — **no photo, no name**
- [ ] Pass (left) and Interested (right) both work; a right swipe is **private**
- [ ] Same-gender swipe never counts as interest
- [ ] Send a formal introduction request ("Send request") → up to 5/day; request expires 72h
- [ ] Declines are **silent** (no notification, no disclosure)
- [ ] Mutual interest → connection appears in Connections screen
- [ ] Connections approve/reject works **inline** on the admin side (see §8)
- [ ] Both parties confirm → state becomes connected
- [ ] Introduction screen: values-only thread, message sends
- [ ] Contact-detail blocking: a message containing a phone / `@handle` / link is **rejected
      (422)** before save
- [ ] Admin-hidden message is blanked for the user but retained server-side

## 7. Feedback / comments / concerns → operator

- [ ] My Profile → **"Feedback & help"** opens the form
- [ ] Kind selector shows: **Feedback**, **Question**, **Report a concern**
- [ ] Empty/whitespace-only body → validation error ("Please write a short message.")
- [ ] Send a **Feedback** → success state; appears in admin Feedback panel
- [ ] Send a **Question** → appears in admin Feedback panel
- [ ] Send a **Report a concern** → appears in admin Feedback panel
- [ ] **Report** kind triggers an **operator ping** to the admin bot, formatted
      `"{publicCode}: {first 140 chars}"` — and **never** a name/phone/@
- [ ] Feedback/Question kinds do **not** ping (silent), per design
- [ ] The message body is not echoed back with any identity attached

## 8. Admin console

- [ ] Operator sign-in works (password + own cookie/CSRF); show/hide password toggle works
- [ ] Failed sign-in surfaces a **precise** failure (code/status), not a generic error
- [ ] **Submissions**: review queue loads; open a submission detail
- [ ] Approve a submission → candidate notified (privacy-safe message)
- [ ] Request changes → candidate sees the private note in-app
- [ ] **Funnel** tab: stat boxes show **value → name → description**, each stacked and
      fitting inside its box on a **phone-width** viewport
- [ ] Funnel tabs: **summary / submissions / requests / connections** all render
- [ ] Funnel empty-state card is **not** shown when there is data
- [ ] **Connections**: approve/reject works **inline**
- [ ] **Feedback** panel: the three test messages from §7 are listed
- [ ] Opening a feedback item marks it read
- [ ] No PII (name/phone/@) appears anywhere in the admin UI lists or funnel

## 9. Mobile usability (phone-width)

- [ ] Summary fits the phone screen (no horizontal overflow)
- [ ] Bottom navigation is **fixed**
- [ ] "Select a candidate to review…" placeholder card is **absent**
- [ ] Funnel list shows code + age + open sign; lower section is actionable
- [ ] Scroll works smoothly through long lists

## 10. Notifications (privacy-safe copy)

Trigger each where possible and confirm generic wording only:

- [ ] Profile approved
- [ ] Profile changes requested
- [ ] Profile rejected / review complete
- [ ] Connection confirmation required
- [ ] No notification ever contains a name, phone, @, or other party's identity

## 11. Single-mode + rollback readiness

- [ ] Confirmed long-polling is stopped now that the webhook is live
- [ ] If the webhook must be rolled back: `deleteWebhook` (or `unsetWebhook`) then restart
      long-polling — **never both at once**
- [ ] Verified `/internal/health` probe returns expected status
- [ ] Alert channel confirmed (UptimeRobot → **email + mobile app**, no paid Telegram tier)

---

## Sign-off

- **Blocking defects found:** ______________________________
- **Non-blocking / polish:** ______________________________
- **Ready to move a pilot cohort?** YES / NO
- **Confirmed by operator:** ____________________  on ____________

_Privacy invariant reminder: no name, photo, phone, or `@` ever appears in bot messages,
buttons, notifications, or admin lists. Discovery and introductions stay values-only.
