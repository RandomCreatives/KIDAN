# Phase 02 — Working Context (resume point)

Last updated: 2026-08-12
Purpose: precise resume notes so work can continue without re-deriving context.

## Current repo state
- Phase 01 is **complete and verified in CI** (commit `90614b4`, cleanup `053fb6e`). CI green: `check` + `integration` jobs pass. `ENABLE_REAL_SUBMISSIONS` remains `false`.
- Branch protection on `main` is still *pending repository administration* (recorded in `docs/HANDOFF.md`).
- We are now in **Phase 02 — Mini App and API Integration** (`02_MINI_APP_AND_API_INTEGRATION.txt`).
- Today we began **Workstream A (client auth state)** and the **Workstream B foundation (resumable drafts)**. Work is **in progress and NOT yet committed** (working tree only) except where noted.

## What is already edited (uncommitted WIP, typecheck-green)
1. `packages/contracts/src/auth.ts`
   - `sessionStatusSchema` now **requires** `csrfToken` (so session restore returns a CSRF token — needed for later mutations).
   - Added `apiErrorCodeSchema` (enum of known codes), `apiErrorSchema`, `apiErrorEnvelopeSchema`, and exported types `ApiErrorCode`, `ApiErrorBody`, `ApiErrorEnvelope`.
2. `packages/contracts/src/onboarding.ts`
   - Added `draftResponseSchema` (`{ schemaVersion, currentStep, payload, version, submitted, identityComplete }`) and `draftSaveResponseSchema` (`{ version, currentStep }`).

These are additive and the full workspace typecheck passes.

## Environment constraints (important)
- This sandbox has **no PostgreSQL and no Telegram test bot**, so the e2e Telegram flow (Workstream A/D acceptance) cannot be *executed* here. The client, auth-state machine, and draft integration are buildable and unit/component-testable.
- Decision taken (user said "alright"): build the client against the **existing local API routes**; no external API origin/proxy assumed. Vite already proxies `/api` → `localhost:4000` (`apps/miniapp/vite.config.ts`), but the client should target a configurable `baseUrl` (default `/api` for same-origin Telegram deployment).
- Demo (browser) mode must stay fully synthetic and must never call the real API.

## Plan / remaining work (Workstream A then B)

### A1. API: CSRF on session restore
- `apps/api/src/persistence/types.ts` — add to `PersistenceRepository`:
  `updateSessionCsrf(tokenHash: Buffer, csrfTokenHash: Buffer, now: Date): Promise<void>;`
- `apps/api/src/persistence/memoryRepository.ts` — implement (set `csrfTokenHash` on the active session keyed by `tokenHash.toString("hex")`).
- `apps/api/src/persistence/postgresRepository.ts` — implement:
  `UPDATE app_session SET csrf_token_hash = $2 WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $3` (pass `now` as `$3`).
- `apps/api/src/auth/sessionService.ts` — add:
  `rotateCsrf(sessionToken: string, now = new Date()): Promise<{ csrfToken: string } | null>` that validates length, computes `tokenHash`, calls `findActiveSession`; if null or `suspended`/`deleted` returns null; else generates `randomBytes(32).toString("base64url")`, persists via `updateSessionCsrf`, returns `{ csrfToken }`.
- `apps/api/src/routes/auth.ts` — `GET /v1/session` should `authenticate` then `rotateCsrf` and return `csrfToken` in `data` (now required by `sessionStatusSchema`). Keep 401 when unauthenticated.

### A2. Miniapp: typed API client
- New `apps/miniapp/src/api/client.ts`:
  - `class KidanApiClient` with `baseUrl` (default `/api`) and injectable `fetchImpl` (for tests).
  - Methods: `authenticateWithTelegram(initData)`, `getSession()`, `logout(csrfToken)`, `getDraft()`, `saveDraft(patch, csrfToken)`.
  - Internal `request<T>()` uses `credentials: "include"`, parses `{ data }` / `{ error: { code, requestId } }`, throws typed `ApiError { code: string; status: number; requestId?: string }` on non-2xx. Never logs tokens/request bodies.
- New `apps/miniapp/src/api/client.test.ts` (vitest, node env): mock `fetch`, assert success envelope, 401→UNAUTHENTICATED, 403→INVALID_CSRF/ACCOUNT_UNAVAILABLE, 409→DRAFT_VERSION_CONFLICT, 503→REAL_SUBMISSIONS_DISABLED, network failure.

### A3. Miniapp: auth state machine + provider
- New `apps/miniapp/src/auth/authState.ts` — `AuthStatus = "initializing" | "unauthenticated" | "authenticating" | "authenticated" | "expired" | "unavailable" | "fatal"` plus a pure `mapErrorToStatus(code, httpStatus): AuthStatus` (testable, no React).
- New `apps/miniapp/src/auth/authState.test.ts` — transitions for each code (e.g., 401→expired, 403 ACCOUNT_UNAVAILABLE→unavailable, 403 INVALID_CSRF→fatal/integrity, 503→unavailable, network→fatal).
- New `apps/miniapp/src/auth/AuthProvider.tsx` — React context:
  - On mount: if demo → status `authenticated` (demo passthrough, no network). If Telegram → `getSession()`; on 200 set `authenticated` + store `csrfToken`; on 401 call `authenticateWithTelegram(initData)`; on success set `authenticated`; on `ACCOUNT_UNAVAILABLE` → `unavailable`.
  - Store `csrfToken` in `sessionStorage` (key `kidan_csrf`) with in-memory fallback; **never** `localStorage`.
  - `logout()` → `POST /v1/session/logout` with `x-csrf-token`, clear csrf, set `unauthenticated`.
- New `apps/miniapp/src/auth/useAuth.ts` — hook.
- Wire `AuthProvider` in `apps/miniapp/src/main.tsx` (wrap `<App/>`). Keep existing synthetic screens intact; show a minimal logout/status affordance only in Telegram mode.

### B. Resumable public drafts (after A lands)
- `getDraft()` → map `payload` into the seven-step form (no identity fields).
- `saveDraft(patch, csrfToken)` at deliberate boundaries (Continue/Back/Save); bump local `version` only from server response.
- Workstream C conflict UX on 409 `DRAFT_VERSION_CONFLICT`: stop writes, fetch latest, offer "Reload latest".

## Key files to mirror for tests
- API route tests: `apps/api/test/authRoutes.test.ts` (uses `buildApp` + `MemoryPersistenceRepository` + signed initData helper).
- API unit tests: `apps/api/test/sessionService.test.ts` (add a `rotateCsrf` test).
- API integration tests (Postgres, CI-only): `apps/api/test/integration/postgresRepository.integration.test.ts` (add `updateSessionCsrf` coverage if desired).

## Verification commands (run tomorrow)
- `npm run typecheck`
- `npm test -w @kidan/api` and `npm test -w @kidan/miniapp`
- `npm run build`
- `npm run check` (typecheck + unit + build + audit + diff)
- Integration (CI only, needs Postgres): `npm run db:test`.

## Commits so far today (Phase 02)
- None yet — contracts WIP is uncommitted in the working tree. Plan: commit the contracts scaffolding as one commit, then the API CSRF + client + provider as a second "Phase 02 Workstream A" commit, then B as a third. Do **not** push WIP to `main` until the integration suite still passes and the user confirms.

## Open question resolved
- API origin: default to same-origin `/api` (existing routes). No external proxy configured.
