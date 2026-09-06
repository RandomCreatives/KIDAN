# Phase 02/03 — completing the carried-over client evidence

The six phone screenshots confirmed the live authenticated onboarding flow.
These remaining checks are easiest to capture on a **laptop/desktop browser**
using Telegram Web (which renders the same Mini App with real initData and the
same cookies). Record results as screenshots with secrets redacted — never
capture cookie values, CSRF tokens, `initData`, or the bot token.

Staging app: `https://kidan-staging-app.vercel.app/`
Open Telegram Web at https://web.telegram.org, open **@kdatingxbot**, tap the
**Menu button** (bottom-left / "Open" on the bot), and the Mini App opens. Then
open the browser DevTools (Chrome/Edge: `F12` or `Ctrl+Shift+I`).

> Note after A1: production/staging 401 responses intentionally return only
> `{ code, requestId }`; the verbose token probe/bot-id now appears only with
> `?debug=1` in the URL and only logs server-side. Don't expect those fields in
> a staging 401 body anymore.

## 1. Cookie flags (HttpOnly · Secure · SameSite)
- DevTools → **Application** tab → **Storage → Cookies → https://kidan-staging-app.vercel.app**
- Find the session cookie (`__Host-kidan_session`).
- Confirm columns: **HttpOnly = ✓ (checked)**, **Secure = ✓**, **SameSite = Strict**.
- Screenshot; the cookie's *value* is automatically hidden/grayed — leave it so.

## 2. Storage hygiene
- **Application → Local Storage →** the app origin: confirm it is **empty** (no
  onboarding/auth keys).
- **Application → Session Storage →** the app origin: confirm it contains **only
  the CSRF item** (and no profile/personal fields).
- Screenshot both panels.

## 3. Same-origin network + headers
- **Network** tab → reload the Mini App.
- Confirm API calls go to the **same origin** path `/api/...` (no `localhost`,
  no other host). The only third-party request is
  `https://telegram.org/js/telegram-web-app.js`.
- Click the page request → **Headers** → confirm `content-security-policy`
  matches the recorded CSP, plus `strict-transport-security`,
  `referrer-policy: no-referrer`, `permissions-policy`, and
  `x-content-type-options: nosniff`.

## 4. Draft persistence (save → close → resume)
- Fill onboarding through a step, tap **Save draft**.
- Close the Mini App (and Telegram Web tab), reopen from the bot.
- Confirm it resumes at the **same step** with the entered values intact.
- (Payload version/step resume is covered by unit tests; this confirms it live.)

## 5. Version conflict + "Reload latest" (two clients)
- Open the Mini App in **two** windows (e.g. Telegram Web in Chrome and the
  phone, or two browsers).
- Save a change in client A; then save a *different* change in client B.
- Confirm client B (stale) is **blocked from silently overwriting** and shows a
  conflict / **"Reload latest"** control; clicking it loads the saved payload,
  version, and visible step coherently.

## 6. Session expiry / recovery and logout
- Force expiry if practical (or wait): confirm the **recovery UI** appears and
  re-auth is deliberate (no silent re-login loop).
- Tap **Exit / Sign out**: confirm the button shows a busy state, then success.
- In **Network**, confirm after logout `GET /api/v1/session` → **401** and no
  further authenticated request is accepted; the cookie is cleared.
- Stale-network/CSRF logout should stay retryable and never falsely say
  "Signed out" (covered by tests; spot-check the button truthfulness).

## 7. Responsive & motion
- DevTools device toolbar (`Ctrl+Shift+M`): check a narrow phone width and a
  wide/desktop width — no horizontal overflow, safe areas fine.
- Zoom the page to **200%** (`Ctrl +`): confirm everything stays operable and
  readable.
- Emulate reduced motion: DevTools → **Rendering** tab →
  **Emulate prefers-reduced-motion: reduce** → confirm nonessential animation
  is removed.

## 8. Keyboard + screen reader
- Tab through auth and the onboarding steps: logical order, every control
  reachable, focus ring never obscured, focus doesn't land in disabled content.
- On Android, enable **TalkBack** (Settings → Accessibility) and walk the flow;
  confirm meaningful labels and live announcements for saving/save-failure/
  conflict/reload/logout states. (Desktop equivalent: NVDA/VoiceOver.)

When captured, attach the redacted screenshots to this directory and tick the
corresponding rows in `OPERATOR_RECORD_PHASE02_DRAFT.md`, then sign the
Operator/Independent-verifier lines.
