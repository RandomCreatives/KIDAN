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
| B2 | Private verification photo — encrypted at rest, **auto-purged 30 days after profile approval** via retention cron (`/internal/retention`) | migration 0003 |
| B3 | Separate password-protected operator admin review console (own cookie/CSRF) | `/v1/admin/session`, `/v1/admin/submissions*` |
| B4 | Candidate review status + privacy-safe Telegram notifications (no identity in messages) | notifier service |
| B6 | Self-serve data export + account deletion + privacy policy | `/v1/onboarding/export`, `/v1/onboarding/delete-account` |
| C | Values-only, photo-less/name-less Tinder-style discovery feed; private pass/interested; **one-sided interest never disclosed** | `GET /v1/discovery/feed`, `POST /v1/discovery/decision` |
| D1 | Mutual interest → `connection` row (canonical a<b, created in the decision transaction) → admin approve/reject → **both** participants confirm → `connected`; decline/reject paths; rejection invisible | `GET /v1/connections`, `POST /v1/connections/:id/confirm`, `/v1/admin/connections*` |
| D3 | Restricted **in-app-only** introduction for connected pairs: phone/Telegram/links blocked before save (422), values-only thread, admin hide-message moderation; name/phone/Telegram never revealed | migration 0006; `GET/POST /v1/connections/:id/introduction`, `/v1/admin/introductions*` |

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

Not started. In order:
1. **E1 Invite allowlist** — single-use invite codes; only invited adult EOTC candidates can
   submit, to keep the pilot controlled (not payment, not VIP).
2. **E2 Privacy-safe funnel metrics** — counts only (submitted, approved, mutual interest,
   introductions), no PII, no third-party analytics.
3. **E3 Monitoring/alerts** — `/ready` write-probe, error-rate/auth-failure alerts, log-redaction
   verification (includes completing the Track D staging deploy above).
4. **E4 Pilot runbook & data-policy docs** — operator steps, incident response, and the
   legal/cultural study notes the future monetization decision waits on.

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
