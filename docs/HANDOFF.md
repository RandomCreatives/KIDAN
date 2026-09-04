# Kidan — Agent Handoff

Updated: 2026-09-04 (Africa/Nairobi)

## Connection error fix

The TMA displayed "Connection error" on load. Root cause analysis and fixes:

### Root causes
1. **`.env` not loaded by API** — `process.loadEnvFile()` loads from `process.cwd()`, which is `apps/api/` when running via npm workspace. The root `.env` was never found.
2. **Missing `SERVICE_NOT_READY` contract** — API had no fallback when persistence was unconfigured; auth routes returned 404 instead of 503.
3. **`migrate.ts` did not load `.env`** — the migration script also failed to find the root `.env`.

### Changes made
- `apps/api/src/runtimeApp.ts` — `loadLocalEnvironmentFile()` now walks up the directory tree to find the root `.env`.
- `apps/api/src/database/migrate.ts` — imports and calls `loadLocalEnvironmentFile()` before reading `DATABASE_URL`.
- `apps/api/src/appFactory.ts` — registers fallback 503 `SERVICE_NOT_READY` routes for `/v1/auth/telegram`, `/v1/session`, `/v1/onboarding/draft` when persistence is not configured.
- `packages/contracts/src/auth.ts` — added `SERVICE_NOT_READY` to `apiErrorCodeSchema`.
- `apps/miniapp/src/auth/authState.ts` — added explicit `SERVICE_NOT_READY` → `fatal` mapping.

### Local verification
- `npm run typecheck` — passed (all 4 workspaces)
- `npm run test` — 162/162 passed (contracts: 13, miniapp: 105, api: 43, bot: 1)
- API started on `:4000`, health check OK
- Vite proxy confirmed working: `/api/v1/session` → 401 `UNAUTHENTICATED` (expected without cookie)
- PostgreSQL running natively on `:5432`, database accessible, migrations applied

## Current position

PR #2 (phase 2 / T5) is still open and must not be merged yet.

The currently published PR head is `a69640931b550af496fe622018d02ca03dd5c4b2` (tree `63e3c0f20276dcffa531cef0b0d38a873d7369be`). Exact-head Actions run `32038437039` passed on that published head. CodeRabbit exact-head review `4959449779` then posted six actionable inline findings plus one persistence-test nitpick.

A new local correction commit, `066d301` (`fix: address exact-head review findings`), is based directly on published head `a696409`. It is not published at the time of this update.

## What the latest correction changes

- maps generic HTTP 5xx authentication failures to the recoverable `fatal` state while retaining the deliberate `REAL_SUBMISSIONS_DISABLED` unavailable state;
- allows the Mini App to be framed by `https://web.telegram.org` in both the application CSP and production Nginx header, with a parity regression;
- hydrates the server `submitted` flag and renders the completion state without an extra draft write;
- announces draft loading/error transitions through a polite, atomic live region;
- tracks a persisted public-draft baseline so implicit CSRF/session recovery does not overwrite unsaved public-form edits, while explicit conflict reload remains authoritative;
- rejects directly inverted partial partner-age bounds and rejects bounds that become inverted only after merging with persisted data;
- verifies out-of-scope identity keys against repository persistence rather than only the public response.

## Local verification for the correction

Run from a clean dependency install:

- `npm ci` — passed
- `npm run check` — passed
  - contracts: 13/13
  - Mini App: 105/105
  - API: 40/40
  - bot: 1/1
  - total: 159/159
  - all TypeScript checks and all production builds passed
- `npm audit --audit-level=low` — passed, 0 vulnerabilities
- focused auth, CSP, onboarding-flow, draft-hook, contract, route, and service regressions — passed
- `git diff --check` — passed

This local evidence is not a substitute for a new strict exact-head GitHub Actions run after publication.

## Remaining merge gates

1. Publish the new correction commit(s) without rebasing, squashing, amending, or force-pushing.
2. Confirm the remote PR head and authoritative tree match the publication mailbox.
3. Run strict exact-head Actions on the new head and require all checks to pass.
4. Request and complete another substantive exact-head CodeRabbit review; review completion is not approval.
5. Post finding-by-finding dispositions for review `4959449779` and resolve all review conversations in GitHub.
6. Replace the incorrect PR description with the correction-aware final PR body.
7. Complete truthful external operator evidence for HTTPS/Telegram launch behavior, CSP headers, privacy boundaries, retry behavior, and screen-reader announcements. Do not fabricate unavailable evidence.
8. Re-check ruleset and mergeability only after every gate above is complete.

## Product boundaries that remain binding

Kidan is an anonymity-first introduction service for adult Ethiopian Orthodox Tewahedo Church candidates. Discovery is values-only and shows no candidate name, phone number, social-media links, or candidate photo. A private verification photo is admin-only and is scheduled for deletion 30 days after profile approval. Chat cannot start until both users express interest and an administrator approves the connection; after both users give final confirmation, the product opens a restricted in-app introduction rather than revealing direct contact details. The controlled pilot remains free. Payment, wallet, credits, ratings, VIP, and paid verification are out of scope.

## Evidence and deployment limits

The repository contains evidence templates under `docs/evidence/phase-02/`, but no approved HTTPS host, Telegram test bot/operator, Nginx runtime, or screen-reader operator is available locally. Those external checks remain unverified and must be performed by an authorized operator. PostgreSQL integration evidence must come from exact-head GitHub Actions because PostgreSQL cannot run in the local workspace.

## Next implementation phase

Do not begin discovery/matching work until PR #2 clears all merge gates. After phase 2 closes, begin phase 3 as a separate reviewed change: values-only anonymous discovery, mutual-interest state, administrator approval, both users’ final confirmation, and restricted in-app introductions, while preserving every privacy and pilot boundary above.
