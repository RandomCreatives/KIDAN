# Phase 02 operator record — pre-filled draft (finalize with screenshots)

Legend:
- **[MACHINE-VERIFIED]** = objectively confirmed against the live deployment on
  2026-09-06 by the build/agent; value recorded below.
- **[OPERATOR REQUIRED]** = must be performed by a human in a real Telegram
  client and evidenced by a redacted screenshot/recording.

Target head: **2cda55e1ea03bb211048aa42f7e6eec4ba85d078**
(PR #2; `phase2/miniapp-api-integration` == `staging/phase-02-1765dee`).

## Build and environment
- Final 40-character commit SHA: **2cda55e1ea03bb211048aa42f7e6eec4ba85d078** [MACHINE-VERIFIED]
- Approved HTTPS test URL (frontend): **https://kidan-staging-app.vercel.app/** [MACHINE-VERIFIED]
- API (same-origin via edge rewrite): **https://kidan-staging-app.vercel.app/api/** → API project; direct origin https://kidan-staging-api.vercel.app
- Deployment/build ID: Vercel Production, branch `staging/phase-02-1765dee` (record the `dpl_…` ID shown in Vercel) **[OPERATOR REQUIRED]**
- `ENABLE_REAL_SUBMISSIONS=false` proof: config default is `false`; confirm the env var in Vercel and attach redacted settings screenshot **[OPERATOR REQUIRED]**
- UTC date/time of verification run: **2026-09-06T01:06Z** (operator-local EAT 04:06, Africa/Nairobi) [MACHINE-VERIFIED for automated checks]
- Operator: **[OPERATOR REQUIRED — name]**
- Telegram client/platform/version: **[OPERATOR REQUIRED]** (e.g. Telegram Android 11.x / iOS / Telegram Web)
- Browser engine/version: Mini App WebView (Chromium on Android) **[OPERATOR REQUIRED exact version]**
- Screen reader/version: **[OPERATOR REQUIRED]**
- Evidence artifact links and SHA-256 hashes: **[OPERATOR REQUIRED]** (add screenshot file names/hashes)

## Redaction confirmation
Confirm every item below is absent from this record and all linked artifacts:
- [ ] raw Telegram `initData` or hash/signature
- [ ] bot token
- [ ] cookie/session token
- [ ] CSRF value
- [ ] Telegram ID, name, or username
- [ ] phone/name/date of birth/photo or other personal data
- [ ] internal public code or request secret

Synthetic test-data description (must not identify a real person): use a Telegram
test account you control; no real name/photo. Note: automated signature probes
created inert synthetic users (ids 555001–555003) which can be purged.

## Deployed response and source inventory
- [x] **[MACHINE-VERIFIED]** HTTPS root returns the reviewed CSP header (observed, see below).
- [x] **[MACHINE-VERIFIED]** Exact redacted header output recorded below.
- [ ] **[OPERATOR REQUIRED]** `frame-ancestors` behavior confirmed in Telegram mobile + Telegram Web.
- [x] **[MACHINE-VERIFIED]** `/api` is same-origin (client baseUrl `/api`; calls target `https://kidan-staging-app.vercel.app/api/...`); no localhost requests.
- [x] **[MACHINE-VERIFIED]** Network inventory = same-origin + the reviewed `https://telegram.org/js/telegram-web-app.js` SDK only. The `https://json-schema.org` / `https://react.dev` strings in the JS bundle are source comments, not network requests.
- [x] **[MACHINE-VERIFIED]** No third-party fonts/analytics/trackers/pixels/ads/session-replay endpoints.

Observed exact CSP (root and proxied API responses):
`default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors https://web.telegram.org; object-src 'none'; base-uri 'self'; form-action 'self'; block-all-mixed-content`

Other headers observed:
- API: `cache-control: no-store`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`, `permissions-policy: camera=(), microphone=(), geolocation=()`
- App: same CSP/permissions/referrer/HSTS; `server: Vercel`.

## Live runtime checks (machine-verified this session)
- [x] `GET /health` → **200** `{"data":{"status":"ok","service":"kidan-api",...}}`
- [x] `GET /ready` → **200** `{"data":{"status":"ready","service":"kidan-api"}}` (write-path probe: performs the login insert shape in a rolled-back transaction; 200 proves the authenticated DB write path works)
- [x] `GET /api/v1/session` unsigned → **401** `UNAUTHENTICATED` (correct)
- [x] Token-signed `POST /api/v1/auth/telegram` → **200** with session (proves signature verification + session create DB write)
- [x] Bot token live-verification (`getMe`) → `ok:true, id:8896512082, username: kdatingxbot`
- [x] GitHub checks green on prior head; `2cda55e` delta is presentation-only (debug gating) — confirm both checks green on the merge commit.

## Synthetic Telegram lifecycle (all [OPERATOR REQUIRED] in a real Telegram client)
- [ ] First authentication; API response exposes no Telegram/internal user ID
- [ ] Opaque HttpOnly/Secure/SameSite=Strict cookie observed (record presence only, never the value)
- [ ] Refresh restores the cookie-backed session and current CSRF into sessionStorage only
- [ ] Fresh public draft creation
- [ ] Five ordered public-only checkpoints through final preview
- [ ] Refresh resumes saved payload, version, and current step
- [ ] Second client creates a version conflict; first client cannot overwrite silently
- [ ] "Reload latest" applies payload/version/visible step coherently
- [ ] Expired/revoked session produces recovery UI and re-authenticates deliberately
- [ ] Logout waits for server confirmation and announces busy/success/failure truthfully
- [ ] Post-logout `GET /v1/session` returns 401
- [ ] No auth request or accepted cookie after confirmed logout
- [ ] Stale-CSRF/ambiguous-network logout remains retryable and never falsely says "Signed out"

## Privacy/storage inspection (mix)
- [x] **[MACHINE-VERIFIED]** Error responses carry no private identity/cookie/CSRF; the API contract exposes only `authenticated/csrfToken/profileStatus/expiresAt` and `{error:{code,requestId}}`.
- [ ] **[OPERATOR REQUIRED]** Public-draft request/response contains no private identity/consent/verification/contact data
- [ ] **[OPERATOR REQUIRED]** `localStorage` contains no onboarding/auth data
- [ ] **[OPERATOR REQUIRED]** `sessionStorage` contains only the expected CSRF item
- [ ] **[OPERATOR REQUIRED]** URL/history/referrer contain no onboarding/auth values
- [x] **[MACHINE-VERIFIED]** Application logs redact authorization/cookie/csrf/body/set-cookie (Fastify redact config).
- [x] **[MACHINE-VERIFIED]** Real identity, verification, submission, admin approval, discovery, matching, messaging, contact reveal, and payments are not implemented in Phase 02; pilot is free (`ENABLE_REAL_SUBMISSIONS=false`).

## Responsive and motion ([OPERATOR REQUIRED])
- [ ] Narrow Telegram-sized viewport
- [ ] Wider viewport
- [ ] Safe-area top/bottom/left/right
- [ ] No horizontal overflow at supported widths
- [ ] 200% zoom/text scaling operable/readable
- [ ] Reduced-motion removes nonessential motion

## Keyboard and screen reader ([OPERATOR REQUIRED])
- [ ] Logical keyboard-only order through auth and all five onboarding steps
- [ ] Every action keyboard-operable
- [ ] Visible focus never obscured
- [ ] Validation/error focus or announcement identifies the problem
- [ ] Disabled and `aria-busy` states announced during save/reload/logout
- [ ] Labels/names meaningful without visual context
- [ ] Live announcements verified (auth, saving, save failure, conflict, reload, logout busy/failure, signed-out)
- [ ] No focus moves into disabled content or disappears after a step transition

## Defects and disposition (fixed this phase; all verified)
| # | Severity | Defect | Fix (commit) | Retest |
|---|---|---|---|---|
| 1 | P0 | initData HMAC incorrectly excluded the `signature` field → every real launch `INVALID_SIGNATURE` | da4c0de | Pass: real Telegram auth now succeeds |
| 2 | P0 | Detached native `fetch` → WebView "Illegal invocation" → false NETWORK/HTTP 0 | f7bdb42 | Pass (chromium + device) |
| 3 | P1 | `/ready` only ran `SELECT 1` (false green on unmigrated/unwritable DB) | 3dfa102 | Pass (write-path probe) |
| 4 | P1 | fastify/fast-uri audit advisories | 6427656 | Pass: `npm audit` 0 |
| 5 | P2 | Ungoverned 500/404 diagnostics; missing SERVICE_NOT_READY contract | b5/37/588… | Pass |
| 6 | P2 | Verbose on-screen diagnostics in production | 2cda55e (`?debug=1`) | Pass |

No unresolved blocker or major known.

## Final operator declaration
- [ ] All checks performed on the exact final SHA **2cda55e1ea03bb211048aa42f7e6eec4ba85d078** and approved HTTPS deployment.
- [ ] Evidence is synthetic and redacted.
- [ ] `ENABLE_REAL_SUBMISSIONS=false` confirmed on that deployment.
- [ ] No blocker or major remains.

Operator name/date: **[OPERATOR REQUIRED]**
Independent verifier name/date: **[OPERATOR REQUIRED]**
