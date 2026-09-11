# Kidan — Pilot Operations Runbook (Track E4)

Status: operational procedure for the controlled pilot. Applies to the pilot
deployments (hosted on Vercel + Postgres/Neon) and assumes the operator is the
channel administrator (`@Kidusi16`).

---

## 1. What the pilot is

- Free during the 3–6 month controlled-learning window (no payments, credits,
  wallet, ratings, VIP, or paid verification in this phase).
- Adult Ethiopian Orthodox Tewahedo candidates only (21–45), verified privately
  before admission.
- Discovery is values-only (no photo, no name). Identity is revealed only after
  an accepted introduction request, both confirmations, and an administrator
  approval.

---

## 2. Services & URLs (staging)

| Service | URL | Deploys from |
|---|---|---|
| Mini App (candidate) | https://kidan-staging-app.vercel.app/ | `staging/phase-03-d1d3-88a5b90` |
| API | https://kidan-staging-api.vercel.app/ | `staging/phase-03-d1d3-88a5b90` |
| Admin console | https://kidan-staging-admin.vercel.app/ | `main` (merge) |
| Telegram bot | `@KidanAppBot` | — |

Staging is pinned to a **release branch** (`staging/phase-03-d1d3-88a5b90`); the
admin console builds from `main`. New features land on
`feature/intentional-requests` → PR → merge to `main` (merge commit, never
squash).

---

## 3. Migrations (automatic)

Schema migrations are applied automatically by the **`Apply database
migrations`** GitHub Actions job on every merge to `main` (it runs
`npm run db:migrate` against `DATABASE_URL` from a GitHub **repository secret**
of the same name). Set the `DATABASE_URL` GitHub secret to the same value as the
API's `DATABASE_URL` env var. **Keep the release branch's staging DB migrated** —
if a migration is ever missing, `/v1/admin/metrics` and D2 paths fail with a 500
(`INTERNAL_ERROR`). Have a developer run `npm run db:migrate -w @kidan/api`
locally (with the staging `DATABASE_URL`) in the rare event you need it sooner.

## 3b. Environment variables (API)

Set in the Vercel API project. Missing optional ones are safe (features stay off).

| Var | Purpose | Default |
|---|---|---|
| `ENABLE_REAL_SUBMISSIONS` | Enables real onboarding/discovery/requests | `false` |
| `PILOT_CAPACITY` | Cohort ceiling for new admissions | `100` |
| `RETENTION_CRON_SECRET` | Bearer secret for `/internal/retention` purge | — |
| `MONITOR_CRON_SECRET` | Bearer secret for `/internal/health` probe | — |
| `COMPLETION_CRON_SECRET` | Bearer secret for `/internal/completion/tick` scheduler | — |
| `BOT_STATE_SECRET` | Bearer secret for `/internal/bot-state` (Option A bot tier lookup) and `/internal/pairing/answer` (pulse button bridge) | — |
| `ADMIN_CONSOLE_PASSWORD` | Enables the admin review console | — |
| `ADMIN_ORIGIN` | Origin of the admin console (CORS) | staging console |
| `MINI_APP_URL` | Deep-link base for bot notifications | — |
| `APP_ORIGIN` | Candidate Mini App origin (CORS) | — |

`Persistence` requires `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `SESSION_SECRET`,
`IDENTITY_ENCRYPTION_KEY`, `IDENTITY_LOOKUP_KEY` (all or none).

> To activate monitoring/alerting, set `MONITOR_CRON_SECRET` (any strong random
> string). Without it `/internal/health` is not registered (404), which is
> intentional and safe.

---

## 4. Day-to-day operations

### Review queue
Every candidate must be reviewed before admission (this is the real gate; the
pilot is not invite-only). In the admin console:

1. Sign in. Refresh the queue.
2. Open a submission, check the **private verification photo** and identity.
3. **Approve** (replaces the full-res photo with a ≤240px thumbnail and starts
   the 14-day retention clock), **Request changes**
   (reopens the draft for the candidate), or **Reject** (requires a feedback
   note).
4. Under **Connections**, act on pairs awaiting admin approval.

### Verifying the admin bot (no real submission needed)
`GET /internal/admin-notify-test` with
`Authorization: Bearer $ADMIN_NOTIFY_TEST_SECRET` fires a test card to the admin
bot, so you can confirm it's wired up without a candidate. Set
`ADMIN_NOTIFY_TEST_SECRET` (any strong value) on the API project to enable it;
absent -> 404 (safe).

### Admin console bot (phone approvals)
A **separate admin bot** (not `@KidanAppBot`) sends you a privacy-safe message
("new submission awaiting review" / "pair awaiting approval") with an **"Open
console"** button that opens the admin console **inside Telegram** as a Mini App,
where you sign in with the admin password and decide. See
`docs/admin-console-bot.md`. Enabled by `ADMIN_BOT_TOKEN`, `ADMIN_CHAT_ID`,
`ADMIN_CONSOLE_URL`.

### Admission valve & growth
`PILOT_CAPACITY` caps new admissions. When full, new candidates see "the pilot
cohort is currently full" and their profile is saved. Raise it (or run it down as
people are reviewed) deliberately; the pilot should grow only as fast as you can
review and support.

### Funnel metrics
`GET /v1/admin/metrics` (admin session) returns aggregate, counts-only
funnel numbers (submitted/approved/shortlisted, request pending/accepted/
declined/expired, connection pendingAdmin/connected/declined/rejected). The admin
console shows this in the **Funnel (all-time)** panel.

---

## 5. Monitoring & alerting

- **Liveness/outage:** poll `GET /ready` (returns 200 when the DB schema and the
  auth write-path are healthy; 503 otherwise) — wire this to an uptime check.
- **Health/alert probe:** `GET /internal/health` with
  `Authorization: Bearer $MONITOR_CRON_SECRET`. Runs the `/ready` write-probe and
  returns `{ ok, ready, degraded, authFailures24h, serverErrors24h }`. `degraded`
  is true above thresholds (auth failures > 100, server errors > 50 per 24h).
  **Driven by a GitHub Actions scheduled workflow** (`health-monitor.yml`, every
  10 min) — not a Vercel cron, because Vercel's free (Hobby) plan only allows
  once-per-day crons and a sub-daily cron fails the whole deployment. The probe
  needs a GitHub **repository secret** `MONITOR_CRON_SECRET` (same value as the
  API env var) and an optional repository variable `KIDAN_HEALTH_BASE_URL`
  (defaults to the staging API URL). If the secret is absent the job warns and
  skips, and the endpoint stays 404/unauthorized by design.
- **Log-based alerts:** the API logs structured, redacted entries on auth-failure
  and server-error. Alert on spikes of these in your log sink; never rely on
  request bodies being present (they are redacted by design).

### Alert thresholds (start values, tune)
- `/ready` non-200 → critical.
- `/internal/health` `degraded` → alert.
- A burst of `auth_failure` events (e.g. > 20 in 15 min) → investigate (bot token
  misconfig, or a probing attack).

---

## 6. Incident response

1. **Check `/ready`.** 503 = DB/migration issue; 500 with a bad `SERVICE_NOT_READY`
   response = the write-path probe failed.
2. **Check `/internal/health`** (manually, or the `health-monitor` Actions run)
   for error/auth-failure volume; check structured logs for the redacted
   `errorCode`/`errorName`.
3. **Admin console not loading:** it builds from `main`; confirm the merge/deploy.
4. **Candidate cannot submit:** confirm `ENABLE_REAL_SUBMISSIONS=true` and the
   cohort is under `PILOT_CAPACITY`.
5. **Suspected auth/probing abuse:** rotate `MONITOR_CRON_SECRET` and the bot
   token; review the login failure rate; never disclose which candidates exist.
6. **Data breach / privacy incident:** follow the data-policy doc's escalation;
   preserve audit evidence; contact the appropriate authority as required.

---

## 7. Retention & deletion (no manual steps normally)

- Verification photos are **replaced by a ≤240px thumbnail at approval and
  deleted 14 days after approval** by the retention cron (`/internal/retention`,
  daily 02:00).
- Unanswered introduction requests are **purged 72h** after creation; swipes and
  requests for a connected pair are **deleted at connect time**.
- Self-serve export + full account deletion are available to candidates.

---

## 7b. Kidan Completion scheduler (pairing journeys)

- The Vercel cron `GET /internal/completion/tick` (daily **06:00**, declared in
  `apps/api/vercel.json`) advances every pairing journey: readiness re-asks,
  weekly check-in pulses, stall reminders/blocks, and the **+3d closing
  follow-up** after a decouple. It also drains the pending pulse queue to the
  candidate bot in the same call.
- Bearer auth: set **`COMPLETION_CRON_SECRET`** on the API project to a long
  random value, and set **`CRON_SECRET` to the same value** (Vercel Cron sends
  `Authorization: Bearer <CRON_SECRET>`). Unset `COMPLETION_CRON_SECRET` =
  endpoint not registered (feature off, safe).
- **Re-runs are safe.** The closing follow-up is claimed with an atomic
  `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)` against pg, so two
  overlapping runs (accidental double cron, manual POST) can never notify the
  same pair twice. In the file-backed store the claim holds the repo mutex.
- Manual trigger: `curl -X POST -H "Authorization: Bearer $COMPLETION_CRON_SECRET" https://<api-host>/internal/completion/tick`
  (POST is accepted alongside GET exactly for this).
- Bot side needs **no new secrets**: pulse answer buttons (`pair:<pulseId>:<answer>`)
  are forwarded to `/internal/pairing/answer` with the existing `BOT_API_URL` +
  `BOT_STATE_SECRET` pair. The tick is the only job in this system — there is no
  continuous worker.

---

## 8. Pause / close the pilot

- Set `ENABLE_REAL_SUBMISSIONS=false` to stop new submissions; existing
  candidates keep working.
- Stop admitting by not raising `PILOT_CAPACITY` and reviewing the backlog.
- To fully close: stop the cron, then run the documented data-policy deletion
  steps (see `docs/data-policy.md`).
