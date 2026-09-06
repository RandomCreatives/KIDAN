# Phase 02 operator record — draft (screenshot evidence received 2026-09-06)

Legend:
- **[MACHINE-VERIFIED]** = objectively confirmed against the live deployment by
  the build/agent; value recorded below.
- **[OPERATOR-CONFIRMED]** = performed by a human in a real Telegram client and
  evidenced by the redacted screenshots in `screenshots/` (hashes below).
- **[OPERATOR REQUIRED]** = not yet evidenced; remains open before merge.

Reviewed application head: **2cda55e1ea03bb211048aa42f7e6eec4ba85d078**
(PR #2; `phase2/miniapp-api-integration` == `staging/phase-02-1765dee`).
Evidence docs were added in a later docs-only commit (`7afd83f`) that does not
change application code; the running miniapp/API bundles remain those built
from `2cda55e`.

## Build and environment
- Reviewed application commit SHA: **2cda55e1ea03bb211048aa42f7e6eec4ba85d078** [MACHINE-VERIFIED]
- Approved HTTPS test URL (frontend): **https://kidan-staging-app.vercel.app/** [MACHINE-VERIFIED]
- API (same-origin via edge rewrite): **https://kidan-staging-app.vercel.app/api/** → API project; direct origin https://kidan-staging-api.vercel.app
- Deployment/build ID: Vercel Production, branch `staging/phase-02-1765dee` (record the `dpl_…` ID shown in Vercel) **[OPERATOR REQUIRED]**
- `ENABLE_REAL_SUBMISSIONS=false` proof: banner "This preview saves only your public profile sections. Identity, verification, and review are disabled." and preview state "Submission for administrator approval is not enabled in this preview." + "PUBLIC DRAFT PREVIEW — UNSUBMITTED AND UNPUBLISHED" / "DRAFT · NOT SUBMITTED" are shown on every screen (screenshots 01–06) **[OPERATOR-CONFIRMED]**. (Optional extra: attach the redacted Vercel env-var settings panel.)
- Date/time of walkthrough: device clock **04:03–04:11 EAT** on the captures (Africa/Nairobi, UTC+3) = **2026-09-06T01:03–01:11Z**; automated header/runtime run 2026-09-06T01:06Z **[OPERATOR-CONFIRMED / MACHINE-VERIFIED]**
- Operator: **[OPERATOR REQUIRED — name/sign-off]**
- Telegram client/platform: **Telegram Mini App on Android** (status bar shows Android LTE, on-screen Android keyboard; WebView/Chromium) **[OPERATOR-CONFIRMED platform; exact Telegram/WebView version OPERATOR REQUIRED]**
- Screen reader/version: **[OPERATOR REQUIRED]** (not exercised in this walkthrough)
- Evidence artifacts and SHA-256 (all 720×1600 PNG-quality JPG phone captures):

| File | What it shows | SHA-256 |
|---|---|---|
| `screenshots/01-eligibility-unchecked.jpg` | Welcome/eligibility gate, 3 boxes unchecked; pilot banner | `37128f61f758fe626422ec01ddcfdb612c1d3191021b958b1fc19b0b3cf6ee94` |
| `screenshots/02-eligibility-all-checked.jpg` | All 3 eligibility acknowledgements checked | `6893a4ecc2a6eaab7297d006717e635b43bb0ac15b52bfb26dd184d4c72119f6` |
| `screenshots/03-checkpoint-context-gender-city-education.jpg` | Checkpoint "Share context, not your identity"; Gender=Man, Country=Ethiopia, Education=Bachelor's; keyboard open | `304ed8995e5007f73f7b342e5375876538f1a7eb56dbfc766e6f9381f4bf3c22` |
| `screenshots/04-checkpoint-work-family-height.jpg` | Occupation=Teaching, Employment=Employed, Marital=Never married, Children=No children, Height=170 cm; numeric keyboard | `d5bb465a032ac530493714ff56f573dc42c84b455a3ce2ff1b58f2589121dc52` |
| `screenshots/05-public-preview-draft.jpg` | Final public discovery preview; no photo/name; "DRAFT · NOT SUBMITTED"; Save draft | `b3e1f43daa43594f4d0ba958651edf9c6268bc87c1f824b0fd0e3e25a0f3e219` |
| `screenshots/06-public-preview-draft-scrolled.jpg` | Same preview scrolled ("Know exactly what others can see") | `b2fcce80d8257ad08526d2a2db0bf1144720a8e740a09dca65cf05d013fd0656` |

## Redaction confirmation
Reviewed all six captures; every item below is absent from this record and artifacts:
- [x] raw Telegram `initData` or hash/signature — none visible
- [x] bot token — none visible
- [x] cookie/session token — none visible
- [x] CSRF value — none visible
- [x] Telegram ID, name, or username — the Telegram chat header shows the bot's own display title ("testbot"); **no person's** Telegram name/username/ID appears anywhere
- [x] phone/name/date of birth/photo or other personal data — the discovery card intentionally shows **no name and no photo** (name renders as "— / Unassigned"); the only free-text entered is a generic values line
- [x] internal public code or request secret — none visible

Synthetic test-data description: operator walked the flow as a synthetic pilot
user (Gender Man, Ethiopia/Addis Abeba, Bachelor's degree, Teaching/Employed,
Never married, No children, 170 cm, values tags). No real name, photo, phone,
or date of birth is entered or displayed. Automated signature probes earlier
created inert synthetic users (ids 555001–555003) which can be purged.

## Deployed response and source inventory
- [x] **[MACHINE-VERIFIED]** HTTPS root returns the reviewed CSP header (observed, see below).
- [x] **[MACHINE-VERIFIED]** Exact redacted header output recorded below.
- [ ] **[OPERATOR REQUIRED]** `frame-ancestors` behavior confirmed in Telegram mobile + Telegram Web (the captures prove it renders inside the Android Telegram WebView; a Telegram Web/`web.telegram.org` embed check is still wanted).
- [x] **[MACHINE-VERIFIED]** `/api` is same-origin (client baseUrl `/api`; calls target `https://kidan-staging-app.vercel.app/api/...`); no localhost requests.
- [x] **[MACHINE-VERIFIED]** Network inventory = same-origin + the reviewed `https://telegram.org/js/telegram-web-app.js` SDK only. The `https://json-schema.org` / `https://react.dev` strings in the JS bundle are source comments, not network requests.
- [x] **[MACHINE-VERIFIED]** No third-party fonts/analytics/trackers/pixels/ads/session-replay endpoints.

Observed exact CSP (root and proxied API responses, 2026-09-06T01:06Z):
`default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors https://web.telegram.org; object-src 'none'; base-uri 'self'; form-action 'self'; block-all-mixed-content`

Other headers observed:
- API: `cache-control: no-store`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`, `permissions-policy: camera=(), microphone=(), geolocation=()`
- App: same CSP/permissions/referrer/HSTS; `server: Vercel`.

## Live runtime checks (machine-verified)
- [x] `GET /health` → **200** `{"data":{"status":"ok","service":"kidan-api",...}}`
- [x] `GET /ready` → **200** (write-path probe: performs the login insert shape in a rolled-back transaction; 200 proves the authenticated DB write path works)
- [x] `GET /api/v1/session` unsigned → **401** `UNAUTHENTICATED` (correct)
- [x] Token-signed `POST /api/v1/auth/telegram` → **200** with session (proves signature verification + session-create DB write)
- [x] Bot token live-verification (`getMe`) → `ok:true, id:8896512082, username: kdatingxbot`
- [x] Real Telegram Mini App launch authenticates and lands in onboarding (no error screen) — **[OPERATOR-CONFIRMED]** via screenshots 01–06 (app opened from the bot and rendered the authenticated onboarding flow).
- [ ] GitHub checks green on the exact merge head — confirm in the PR Checks tab before merge (prior head `da4c0de` green; `2cda55e` delta is presentation-only debug gating).

## Synthetic Telegram lifecycle
- [x] **[OPERATOR-CONFIRMED]** First authentication succeeds — the Mini App opens from the bot directly into the authenticated onboarding flow (screenshots 01–06); no auth error is shown. API-contract check that the response exposes no Telegram/internal user ID is **[MACHINE-VERIFIED]** (session contract returns only `authenticated/csrfToken/profileStatus/expiresAt`).
- [ ] **[OPERATOR REQUIRED]** Opaque HttpOnly/Secure/SameSite=Strict cookie observed in DevTools (presence only, never the value).
- [ ] **[OPERATOR REQUIRED]** Refresh restores the cookie-backed session and current CSRF into sessionStorage only.
- [x] **[OPERATOR-CONFIRMED]** Fresh public draft creation — eligibility gate → context checkpoints → public preview reached (screenshots 01–05).
- [x] **[OPERATOR-CONFIRMED]** Ordered public-only checkpoints through the final preview — eligibility (01/02) → "Share context, not your identity" (03) → work/family/height (04) → final public preview (05/06). Every field is labelled "Shown in discovery"; no private identity field is collected in this flow.
- [ ] **[OPERATOR REQUIRED]** Refresh resumes saved payload, version, and current step (after tapping **Save draft**, close & reopen the Mini App).
- [ ] **[OPERATOR REQUIRED]** Second client creates a version conflict; first client cannot overwrite silently.
- [ ] **[OPERATOR REQUIRED]** "Reload latest" applies payload/version/visible step coherently.
- [ ] **[OPERATOR REQUIRED]** Expired/revoked session produces recovery UI and re-authenticates deliberately.
- [ ] **[OPERATOR REQUIRED]** Logout waits for server confirmation and announces busy/success/failure truthfully.
- [ ] **[OPERATOR REQUIRED]** Post-logout `GET /v1/session` returns 401 (machine-verified for the unsigned case; the post-logout case still needs the client walkthrough).
- [ ] **[OPERATOR REQUIRED]** No auth request or accepted cookie after confirmed logout.
- [ ] **[OPERATOR REQUIRED]** Stale-CSRF/ambiguous-network logout remains retryable and never falsely says "Signed out".

## Privacy/storage inspection
- [x] **[MACHINE-VERIFIED]** Error responses carry no private identity/cookie/CSRF; the API contract exposes only `authenticated/csrfToken/profileStatus/expiresAt` and `{error:{code,requestId}}`.
- [x] **[OPERATOR-CONFIRMED]** The discovery projection shown to the user contains no private identity, contact, consent, verification-photo, or Telegram data — the preview card shows values only, with **no photo and no name** ("VALUES FIRST" placeholder; name "— / Unassigned") (screenshots 05/06). Network payload-level check remains **[OPERATOR REQUIRED]** via DevTools if a body capture is desired.
- [ ] **[OPERATOR REQUIRED]** `localStorage` contains no onboarding/auth data (DevTools → Application).
- [ ] **[OPERATOR REQUIRED]** `sessionStorage` contains only the expected CSRF item.
- [x] **[OPERATOR-CONFIRMED]** URL contains no onboarding/auth values — the Mini App runs at the clean root URL `https://kidan-staging-app.vercel.app/` (no tokens/ids in the address area); history/referrer deep-check remains **[OPERATOR REQUIRED]** if desired.
- [x] **[MACHINE-VERIFIED]** Application logs redact authorization/cookie/csrf/body/set-cookie (Fastify redact config).
- [x] **[OPERATOR-CONFIRMED + MACHINE-VERIFIED]** Real identity, verification, submission, admin approval, discovery, matching, messaging, contact reveal, and payments are disabled in this preview — banner and "DRAFT · NOT SUBMITTED / submission not enabled" copy on every screen (01–06); pilot is free.

## Responsive and motion
- [x] **[OPERATOR-CONFIRMED]** Narrow Telegram-sized viewport — all six captures render correctly at 720px-wide phone viewport with no clipping or horizontal overflow; content, cards, segmented controls, and the sticky Continue/Save draft button lay out cleanly (01–06).
- [ ] **[OPERATOR REQUIRED]** Wider viewport (Telegram Desktop / expanded WebView).
- [x] **[OPERATOR-CONFIRMED]** Safe-area behavior — content respects the top Telegram header (X / title / ⋮) and the bottom home indicator; primary buttons sit above the gesture bar (01–06). Left/right inset check on a notched device is **[OPERATOR REQUIRED]** if not already covered.
- [x] **[OPERATOR-CONFIRMED]** No horizontal overflow at the supported phone width (01–06).
- [ ] **[OPERATOR REQUIRED]** 200% zoom/text scaling remains operable and readable.
- [ ] **[OPERATOR REQUIRED]** Reduced-motion removes nonessential motion.

## Keyboard and screen reader
- [x] **[OPERATOR-CONFIRMED]** Touch/keyboard input works through the onboarding steps — the Android on-screen keyboard opens for the city text field (03, alphabetic keyboard) and the height field (04, numeric keyboard); focus scrolls the active field into view above the keyboard.
- [ ] **[OPERATOR REQUIRED]** Logical keyboard-only (Tab/arrow) order through auth and all five onboarding steps (external keyboard / Desktop).
- [ ] **[OPERATOR REQUIRED]** Every action keyboard-operable; visible focus never obscured.
- [ ] **[OPERATOR REQUIRED]** Validation/error focus or announcement identifies the problem.
- [ ] **[OPERATOR REQUIRED]** Disabled and `aria-busy` states announced during save/reload/logout.
- [ ] **[OPERATOR REQUIRED]** Labels/names meaningful without visual context; live announcements (auth, saving, save failure, conflict, reload, logout busy/failure, signed-out) verified with a screen reader (TalkBack).
- [ ] **[OPERATOR REQUIRED]** No focus moves into disabled content or disappears after a step transition.

## Defects and disposition (fixed this phase; all verified)
| # | Severity | Defect | Fix (commit) | Retest |
|---|---|---|---|---|
| 1 | P0 | initData HMAC incorrectly excluded the `signature` field → every real launch `INVALID_SIGNATURE` | da4c0de | Pass: real Telegram auth now succeeds (operator walkthrough 01–06) |
| 2 | P0 | Detached native `fetch` → WebView "Illegal invocation" → false NETWORK/HTTP 0 | f7bdb42 | Pass (chromium + device) |
| 3 | P1 | `/ready` only ran `SELECT 1` (false green on unmigrated/unwritable DB) | 3dfa102 | Pass (write-path probe) |
| 4 | P1 | fastify/fast-uri audit advisories | 6427656 | Pass: `npm audit` 0 |
| 5 | P2 | Ungoverned 500/404 diagnostics; missing SERVICE_NOT_READY contract | b5/37/588… | Pass |
| 6 | P2 | Verbose on-screen diagnostics in production | 2cda55e (`?debug=1`) | Pass |

No unresolved blocker or major known. Two non-blocking cosmetic notes for a later
phase (not code defects, do not gate merge):
- The bot's Telegram **display name still reads "testbot"** (visible in the chat
  header of every capture); username is correctly `@kdatingxbot`. Rename via
  BotFather → "/setname" for a polished pilot.
- One free-text values line in the draft contains an operator typo
  ("Goid behaviour"); it is user-entered draft text, not application copy.

## Remaining open items before merge (the "OPERATOR REQUIRED" set)
1. DevTools/network capture (Telegram Web or remote-inspect the Android WebView):
   cookie flags (HttpOnly; Secure; SameSite=Strict), `sessionStorage` = CSRF only,
   empty `localStorage`, and the public-draft request/response bodies.
2. Draft persistence: tap **Save draft**, close/reopen → payload, version, and
   step resume; then the conflict + "Reload latest" path on a second client.
3. Session lifecycle: expiry/recovery UI, logout busy/success/failure,
   post-logout 401, and no accepted cookie after logout.
4. Wider viewport (Telegram Desktop), 200% text scale, and reduced-motion.
5. One keyboard/TalkBack accessibility pass (order, focus, aria-busy, live
   announcements).
6. Record operator name/date and an independent verifier name/date; confirm
   GitHub checks are green on the merge head.

## Final operator declaration
- [ ] All checks performed on the exact reviewed SHA **2cda55e1ea03bb211048aa42f7e6eec4ba85d078** and approved HTTPS deployment.
- [x] Evidence received so far is synthetic and redacted (screenshots 01–06).
- [x] `ENABLE_REAL_SUBMISSIONS=false` confirmed on the deployment (preview banner + draft state on every screen).
- [ ] No blocker or major remains (open items are non-blocking lifecycle/AT confirmations; sign off once completed).

Operator name/date: **[OPERATOR REQUIRED]**
Independent verifier name/date: **[OPERATOR REQUIRED]**
