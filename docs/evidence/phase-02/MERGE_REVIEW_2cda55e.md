# Exact-Head Review — PR #2 "Phase 02: Mini App ↔ API integration"
**Head reviewed:** `2cda55e1ea03bb211048aa42f7e6eec4ba85d078`
**Branch:** `phase2/miniapp-api-integration` == `staging/phase-02-1765dee` → base `main` (`053fb6e`)
**Scope:** 86 commits, 75 files, +6623/−448. Review date: 2026-09-06.

## Verdict
**APPROVE / ready to merge** once the two human gates below are completed. All
automated gates pass and the Mini App authenticates end-to-end in real Telegram
(@kdatingxbot).

## How it was verified
- Independent local rebuild at head: `npm ci` + `npm run check` — typecheck,
  **172 tests** (contracts, miniapp, api, bot), and all builds pass.
- `npm audit --audit-level=low` → **0 vulnerabilities** (fastify 5.12.3 /
  fast-uri 3.1.7/4.1.4).
- Live staging: `/health` 200, `/ready` 200 (write-path probe), app 200, edge
  proxy `/api/v1/session` 401 unsigned, and a token-signed `/v1/auth/telegram`
  returns **200** (DB session write works).
- Reproduced and fixed the real-device failures in headless Chromium and on
  the actual Telegram WebView.

## Architecture (sound)
- API deployed as a Vercel Node serverless function (`apps/api/api/index.ts`,
  raw `(req,res)` handler forwarding into a single ready Fastify instance per
  cold start). Catch-all rewrite routes all paths to the function.
- Frontend is a static Vite SPA on `kidan-staging-app.vercel.app` with an edge
  `/api/:path*` rewrite to the API project, so the Mini App makes only
  same-origin calls; CSP `connect-src 'self'` holds.
- Security posture retained: initData HMAC + freshness validated server-side;
  opaque `__Host-` HttpOnly/Secure/SameSite=Strict session cookie; double-submit
  CSRF; identity fields encrypted at rest (AES-256-GCM) with lookup HMACs;
  3 independent keys; structured security headers (CSP, HSTS, nosniff, no-referrer,
  permissions-policy); Fastify logger redacts cookie/authz/csrf/body/set-cookie.

## Issues found this round — all FIXED
1. **P0 initData HMAC (`da4c0de`).** Validator stripped both `hash` and the newer
   `signature` field; the bot HMAC must cover all fields except `hash`. Real
   clients send `signature`, so every launch failed INVALID_SIGNATURE while
   synthetic tests passed. Fixed to exclude only `hash`; regression test added.
2. **P0 fetch binding.** Client stored native `fetch` as a method and invoked it
   detached → WebView "Illegal invocation" → false NETWORK/HTTP 0. Now bound to
   `globalThis`; regression test added.
3. **P1 readiness honesty.** `/ready` ran only `SELECT 1`; now performs the real
   login insert shape in a rolled-back transaction, turning schema/privilege/DDL
   drift into a loud 503 instead of a 500 on first login.
4. **P1 audit.** fastify/fast-uri advisories resolved by pinning fastify 5.12.3.
5. **P2 UX/observability.** `SERVICE_NOT_READY` contract + 503 fallback routes +
   distinct recoverable screen; redacted 500/initData diagnostic logging;
   service marker at `/`; bot-token trimmed; live token `getMe` verification.
6. **P2 privacy of diagnostics.** Verbose on-device detail now gated behind
   `?debug=1` (`2cda55e`); production error screens stay clean.

## Residual / follow-ups (non-blocking, Phase 03 candidates)
- **Token secret rotation hygiene:** ensure the bot token pasted during debugging
  was revoked and only the fresh token is in Vercel Production (the numeric bot
  id is unchanged). Periodic rotation procedure to be documented.
- **Synthetic test rows** from signature probes (inert fake users) can be purged.
- The cross-project edge rewrite is working; a future simplification (same-origin
  backend) would remove the hop, but not required.
- Consider removing the `tokenProbe`/`configuredBotId` fields from the 401 body
  for the production profile (currently harmless, non-secret, and gated on the
  client side) — already hidden by `?debug=1` on the UI.
- Close stale/superseded PRs #3 and #4; #5's useful parts are folded in.

## Human gates before merge
1. **Operator evidence** (`docs/evidence/phase-02/OPERATOR_RECORD_TEMPLATE.md`):
   redacted capture of green CI, `/health`+`/ready` 200, and the Mini App
   opening into onboarding from @kdatingxbot.
2. **One substantive human/CodeRabbit review recorded on this exact head**
   (automated CodeRabbit is set to "manual review required" for this repo).

## CI note
At the moment of writing, the check-run records for `2cda55e` were still
propagating on GitHub; they should mirror the green run on `da4c0de` (the only
delta `2cda55e` is a client-presentation gate, all tests green locally). Confirm
"Typecheck, unit tests, build, audit" and "PostgreSQL integration tests" show
success on the merge commit before merging.
