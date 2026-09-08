# Kidan — Agent Handoff

Updated: 2026-09-07 (Africa/Nairobi).

## Current position

**Phase 02 is closed and Phase 03 Tracks A–D are complete and merged to `main`.**
The core privacy-first matchmaking pipeline is implemented end to end:

```
Telegram login → onboarding → encrypted identity vault → verification photo
→ admin review → privacy-safe notifications → values-only discovery
→ mutual interest → admin connection approval → both parties confirm
→ restricted in-app introduction
```

`main` HEAD: **`88a5b9011ea31589049bf65f1cb5f48ed6d95b33`**. All work lands via
PR with CI green (typecheck + unit + build + audit, and a separate PostgreSQL
integration job) and is **fast-forward / merge-commit merged — never squashed**.

Staging deployment is **pinned to a release branch**, not `main` (see Deploy below).

## Shipped tracks

| Track | Deliverable | Key commits / endpoints |
|---|---|---|
| A | Telegram Mini App login (HMAC-validated initData), encrypted identity vault (name/DOB/phone/telegram encrypted at rest), onboarding draft flow | `POST /v1/auth/telegram`, `/v1/session` |
| B1 | Real submit flow with versioned drafts and consent receipts | `/v1/onboarding/*` |
| B2 | Private verification photo — encrypted at rest; **replaced by a ≤240px thumbnail on approval**, then purged **14 days after approval** via retention cron (`/internal/retention`) — Option A | migration 0003 |
| B3 | Separate password-protected operator admin review console (own cookie/CSRF) | `/v1/admin/session`, `/v1/admin/submissions*` |
| B4 | Candidate review status + privacy-safe Telegram notifications (no identity in messages) | notifier service |
| B6 | Self-serve data export + account deletion + privacy policy | `/v1/onboarding/export`, `/v1/onboarding/delete-account` |
| C | Values-only, photo-less/name-less Tinder-style discovery feed; private pass/interested; **one-sided interest never disclosed** | `GET /v1/discovery/feed`, `POST /v1/discovery/decision` |
| D1 | Mutual interest → `connection` row (canonical a<b, created in the decision transaction) → admin approve/reject → **both** participants confirm → `connected`; decline/reject paths; rejection invisible | `GET /v1/connections`, `POST /v1/connections/:id/confirm`, `/v1/admin/connections*` |
| D3 | Restricted **in-app-only** introduction for connected pairs: phone/Telegram/links blocked before save (422), values-only thread, admin hide-message moderation; name/phone/Telegram never revealed | migration 0006; `GET/POST /v1/connections/:id/introduction`, `/v1/admin/introductions*` |
| E2 | Privacy-safe funnel metrics (counts only; no PII/analytics) | `GET /v1/admin/metrics`; admin Funnel panel |
| E3 | Monitoring/alerts: `/ready` write-probe, log-redaction verification, auth-failure/error signal | `/internal/health` (bearer-gated, cron), `audit_event` signals |

**Deferred by design:** D4 contact reveal (name/phone/Telegram) — a separate, future,
explicitly-consented gate; **not in the pilot**. No payments/credits/wallet/ratings/VIP/paid
verification. Discovery stays photo-less/name-less. Verification photo is private and purged
30 days post-approval. Pilot is free.

## Security / privacy invariants (do not regress)

- User-facing discovery, connection, and introduction surfaces are **values-only**: public
  code (KD-XXXXXX), age, city, gender, values, bio. No name, photo, phone, or Telegram handle.
- The bot never sends one user's information to another; one-sided interest is never disclosed;
  admin rejection is invisible to both participants.
- Identity fields are encrypted at rest (`IdentityCipher`, separate encryption/lookup/session
  keys). PII is never logged (Fastify redact config) and never appears in bot notifications.
- Auth diagnostics (configured bot id, token probe) are logged server-side but returned to the
  client **only when `exposeAuthDiagnostics` is true**, which the runtime wires to
  `NODE_ENV !== 'production'` (commit `13bcd38`). Secure by default in production.
- Introduction messages are screened for URLs, `t.me`/`telegram.me`, `@handles`, and
  phone-like digit runs **before persistence**; admin-hidden messages are blanked for users but
  retained server-side for audit.
- Cookies: production uses `__Host-` prefix + Secure; CSRF required on all state-changing routes.

## Repository layout

```
apps/miniapp   React/Vite Telegram Mini App (discovery, connections, introduction, onboarding)
apps/admin     Operator review console (submission review + connection approvals + intro moderation)
apps/api       Fastify 5 API (Vercel Function); services + Postgres/memory repositories
apps/bot       Telegram bot (notifications; never relays identity)
packages/contracts  Shared zod schemas/types (the single source of API truth)
database/migrations 0001..0006 (0006 = introduction_message). Checksums enforced; never edit applied migrations.
```

Useful root scripts: `npm run check` (typecheck+test+build), `npm run db:migrate`,
`npm run db:test` (integration; needs Postgres, runs in CI as a separate job).

## Testing status (main @ 88a5b90)

- contracts 13 suites; miniapp 13 files / 126 tests; admin 3 files / 13 tests;
  api 24 files / 125 unit tests; bot 1 / 1.
- PostgreSQL integration (CI + local Postgres 17): 39 tests (36 repository + 3 migration).
- `npm audit` = 0 vulnerabilities.
- Integration tests share one disposable database per file — **scope shared-DB assertions to
  the ids/codes created in that test** (see `pendingFor` helper; the D1 CI failure was caused by
  assuming the pending queue held only the current pair).

## Deploy (staging = Vercel + Neon)

Vercel projects deploy a **pinned production branch**, not `main`. Current pinned branch is
`staging/phase-02-1765dee` (pre-Track-C) — **Tracks C/D are merged but not yet live.**
A release branch for Tracks A–D has been cut and pushed:

- release branch: **`staging/phase-03-d1d3-88a5b90`** at commit `88a5b90`

Operator steps (full guide: `../kidan-phase-plans/PHASE_03_TRACK_D_STAGING_DEPLOY_2026-09-07.md`,
outside this repo): point the API/miniapp/admin Vercel projects at the release branch and
redeploy; run migration 0006 on the Neon staging DB (additive); set
`ENABLE_REAL_SUBMISSIONS=true` to click through. After deploy, `/v1/connections` on
https://kidan-staging-api.vercel.app must return **401 unauthenticated (not 404)**.

Endpoints/projects: app https://kidan-staging-app.vercel.app/, api
https://kidan-staging-api.vercel.app/, bot @kdatingxbot (id 8896512082). Admin console is the
Vercel project rooted at `apps/admin`.

## Next work — Phase 03 Track E (pilot operations)

**E1 resolved as a lightweight admission valve — no invite codes.** We dropped the invite-only
plan (it was too much operational overhead for a controlled, free pilot) and rely on the existing
review pipeline (onboarding → private verification photo → admin review ~24-72h) as the real gate.
The controlled cohort stays small by lift/promotion, and a configurable ceiling
`PILOT_CAPACITY` (default 100) blocks NEW submissions when the cohort is full
(`PILOT_CAPACITY_REACHED`); already-admitted candidates may always re-submit after
`changes_requested`.

**E2 done — privacy-safe funnel metrics.** Operator/admin-only `GET /v1/admin/metrics`
(gated by the admin session) returns aggregate **counts only** per stage: submitted, approved,
shortlisted, request pending/accepted/declined/expired, connection pendingAdmin/connected/
declined/rejected. No identity, no third-party analytics, no per-user data. Admin console shows a
"Funnel (all-time)" panel. (For a time-bucketed view over the 3-6 month learning period, add a
`sinceDays` window later.)

**E3 done — monitoring / alerts.** The `/ready` write-probe (non-mutating auth-path insertion)
was already in place. Added:
- **Log-redaction verification** (`logRedaction.test.ts`): captures the Fastify log stream and
  asserts the bot token, raw initData body, cookie, csrf header, and connection-string credentials
  are never logged. `appFactory` now accepts a logger object (merged with mandatory redact paths)
  and exports `LOG_REDACT_PATHS`.
- **Alert signal** (`/internal/health`, bearer-gated by `MONITOR_CRON_SECRET`, Vercel cron `*/10`):
  runs the readiness write-probe and reports recent `auth_failure` / `server_error` volume from the
  PII-free `audit_event` table (a `degraded` flag when over threshold). `server_error` is recorded
  by the central error handler; `auth_failure` by the Telegram initData reject path. Repository
  `recordOperationalEvent` / `countOperationalEventsSince` cover both Postgres and memory.

**E4 done — pilot runbook & data policy.** `docs/pilot-runbook.md` (services/URLs,
env vars, review & admission operations, monitoring/alert thresholds, incident
response, retention, pause/close) and `docs/data-policy.md` (data classes, access
minimization, retention table, self-serve export/delete, incident escalation,
data residency + the deferred monetization decision). Both ships on the release
branch.

**PostgreSQL integration suite is GREEN again** after two D2 SQL-type fixes
(`25bece5`, `2fef3de`): the `introduction_request` inserts/updates left `$3`/`$2`
as ambiguous/unreferenced parameters, so Postgres rejected them at runtime; the
fixes pin `$3::timestamptz` + `make_interval(hours => $4::int)` and drop the
unused param. These surfaced only in CI (no local Postgres), which is why they
were found late. **All GitHub Actions checks now pass on `2fef3de`.**

No remaining implementation work in Phase 03 Track E — only the user merge to
`main` and then E4 docs already included.

**Future (discussion only — not built): credit system.** First phase: a free month via a credit
system (credits > direct Telebirr), credits expire after a month; if two months of learning show
it's worth investing, candidates pay on month 3. Later phase 2: one-week trial + direct credit
system. No payments/credits/wallet is implemented in the pilot.

The 3–6 month controlled-learning period starts when the pilot launches, not during construction.

## Workflow conventions

- One track per branch (`phase3/...`); open PR against `main`; poll check-runs; merge by FF or
  merge commit, never squash. Publication patches for chat handoff are shared as `.txt`.
- New endpoints register in **both** `appFactory.ts` (503 fallback when the service is absent)
  and the routes file; gate real behavior on `ENABLE_REAL_SUBMISSIONS === "true"` in
  `runtimeApp.ts`. Repo port = both Postgres and memory repositories + interface in
  `persistence/types.ts`.
- Git: repo-local config only; deploy key `~/.ssh/kidan_deploy` (chmod 600), remote
  `deploy = git@github.com:RandomCreatives/KIDAN.git`. No GitHub token/`gh` in the sandbox;
  push → hand the user the PR URL → poll check-runs → FF-merge.
- Fastify 5.12.3 is pinned; `@kidan/contracts` does not re-export `z`; strict
  `exactOptionalPropertyTypes` (never pass `body: undefined`).
