# Phase 02 — Working Context (resume point)

Last updated: 2026-08-14
Purpose: precise resume notes so work can continue without re-deriving context.

## Current repo state
- Phase 01 is complete and verified in CI (commit `90614b4`, cleanup `053fb6e`). CI green: `check` + `integration` jobs pass. `ENABLE_REAL_SUBMISSIONS` remains `false`.
- We are on **Phase 02 — Mini App and API Integration** (`phase2/miniapp-api-integration`).
- **First independent review** (`PR_02_REQUEST_CHANGES.txt`, RC-01…RC-08) was reworked and pushed as normal follow-up commits (head `d819365`).
- **Second independent review** (`PR_02_SECOND_REVIEW_REQUEST_CHANGES.txt`, R2-01…R2-09) found the prior head still unsafe and listed nine findings. Reworked and pushed as normal follow-up commits (head `8f1d945`).
- **Third independent review** (`PR_02_THIRD_REVIEW_REQUEST_CHANGES.txt`, T3-01…T3-07) on head `8f1d945` reproduced two regressions introduced while fixing R2 (demo could not advance; real final "Save draft" sent no PUT) and required a truthful rework plus a complete test/evidence matrix. All T3 findings are addressed on normal follow-up commits on top of `8f1d945` (see `git log` on the branch for exact SHAs). The branch is **not merged**.
- Branch protection on `main`: reviewer reported ruleset `20794921` active and strict — **re-confirm in the repo** before merge. Recorded in `docs/HANDOFF.md`.
- This sandbox has **no PostgreSQL and no Telegram test bot**. The PostgreSQL integration suite (`npm run db:test`) and live Telegram e2e cannot execute here; they run in CI. Component/hook/transport logic is covered by `@testing-library/react` + `jsdom` tests in this workspace.

## Resolved findings (first round — RC-01…RC-08, head `d819365`)
- **RC-02 — CSRF race-safety:** `rotateCsrf`/`updateSessionCsrf` removed; CSRF derived deterministically from the session token (`deriveCsrfToken`, `restoreSession`). Concurrent restores compute the same token.
- **RC-03 — Auth gate/logout:** `AuthProvider` single-flight (`generationRef`); `resolveSession` pure; `AuthGate` mounts only when `authenticated`; logout succeeds only after server revocation.
- **RC-05 — Mode separation:** demo = persistent network-free banner + synthetic screens; Telegram mode = authenticated public-draft work + truthful `PilotDisabledScreen`.
- **RC-01 + RC-04 — Drafts:** section-specific partial patches (`buildSectionPatch`) + server deep-merge; hydration gated; serialized saves; 409 blocks writes; 401/`INVALID_CSRF` recovery.
- **RC-06 — Runtime validation:** `KidanApiClient` parses responses with shared schemas, fails closed.
- **RC-07 — Tests:** `sessionBootstrap`, client validation, `buildSectionPatch`, API partial-save, Postgres restore.
- **RC-08 — Docs:** HANDOFF + this file updated.

## Resolved findings (second round — R2-01…R2-09, head `8f1d945`)
- **R2-01 — Bound client methods:** `AuthProvider` passes closures (`() => client.getSession()`, `(initData) => client.authenticateWithTelegram(initData)`), eliminating the unbound-`this` TypeError on real Telegram auth.
- **R2-05 — True single-flight + truthful logout:** `AuthProvider` shares one in-flight bootstrap promise; a `generationRef` aborts stale results on `invalidate`. Logout with a missing CSRF restores the session then revokes and never claims success unless the server confirms revocation.
- **R2-06 — Typed transport:** `request` converts network failures → `ApiError("NETWORK")` and malformed/non-JSON bodies → `ApiError("INVALID_RESPONSE")`; parses error envelopes with `apiErrorEnvelopeSchema`. Auth/draft routes validate every success response against shared contracts and fail closed.
- **R2-02 — Drafts tied to navigation:** `saveProgress` is awaitable; `OnboardingFlow` awaits it and only advances/completes after the queued save settles.
- **R2-03 — Resume + discard:** hydration resumes at the server `currentStep` (`serverStepToClientStep`); `reloadLatest` discards unsaved public edits from clean defaults (`resetFormFromPayload`); conflict blocks writes/navigation until recovery.
- **R2-04 — Truthful mode/copy:** mode selected from an explicit launch signal (non-empty Telegram `initData`); `PublicPreview` is mode-aware; `PilotDisabledScreen` scopes the transmission claim.
- **R2-07 — Tests:** added `@testing-library/react` + `jsdom` tests.
- **R2-08 — Styles + a11y:** states have styles + ARIA live regions; `prefers-reduced-motion` honored.
- **R2-09 — Docs:** HANDOFF + this file updated.

## Third review — T3-01…T3-07 (head `8f1d945`, addressed on follow-up commits)
- **T3-01 — CRITICAL — demo + real completion:** `saveProgress` now returns an explicit `{ success, persisted }` outcome. Demo steps advance locally while making zero API calls and never set a persisted claim. The real final preview sends a checkpoint `PUT` (empty public patch with `currentStep: public_preview`) and reaches success only after a valid server response. Click-through tests cover all seven demo steps and the five real steps including the final button and success state.
- **T3-02 — BLOCKER — truthful persisted state:** `useOnboardingDraft` exposes `persisted`, initialized from `res.version > 0` and updated only after confirmed writes/reloads. `App` sets `draftSaved` on successful real completion and on exit. `PilotDisabledScreen` paragraphs are conditional and scoped to onboarding profile data; it no longer claims no transmission occurred after Telegram authentication.
- **T3-03 — BLOCKER — one serialized lifecycle:** `bootstrap`/`commit`/`logout`/`invalidate` share one coordinator using `generationRef` + `loggingOutRef`. Logout awaits any in-flight bootstrap, revokes the final cookie, and clears React CSRF/profile state for every terminal transition. A stale post-logout bootstrap cannot return the provider to authenticated. Tests cover logout, logout-during-bootstrap, and stale-post-logout completion.
- **T3-04 — MAJOR — no silent loss:** `continueFlow` has a synchronous action lock; reload is single-flight with a loading state and reapplies the server step; `INVALID_CSRF` sets an actionable recovery message and triggers CSRF restore instead of returning false silently; queued saves re-check `conflictRef` when they begin.
- **T3-05 — MAJOR — fail closed on envelopes:** `request` throws `ApiError("INVALID_RESPONSE")` when the error envelope fails to validate (absent, non-string, or oversized `requestId`); it no longer trusts a fallback object. `NETWORK` is a client-only transport code (`ClientErrorCode = ApiErrorCode | "NETWORK"`), removed from the shared server `apiErrorCodeSchema`. Tests cover absent/numeric/object/oversized `requestId`.
- **T3-06 — MAJOR — test/operator evidence:** added click-through demo/real flow tests, logout-race tests, malformed-envelope tests, invalid-Origin route tests (mutation rejected 403; safe GET bypass), every auth-gate state, and reload/persist tests. Operator-recorded synthetic-Telegram / responsive / screen-reader visual evidence is **still outstanding** (covered by jsdom logic tests here; it is a pre-merge follow-up, not a code blocker).
- **T3-07 — MAJOR — docs:** `docs/HANDOFF.md` (current state, verification, branch protection, next tasks, Phase 02 status) and this file rewritten to match source; the obsolete `opIdRef` wording is gone. The PR body must be updated to the final commit set only after code/evidence are complete.

## Key files
- API: `src/auth/sessionService.ts`, `src/persistence/{types,memoryRepository,postgresRepository}.ts`, `src/routes/{auth,onboarding}.ts`, `src/onboarding/onboardingService.ts`, `src/app.ts` (origin check).
- Mini App: `src/api/client.ts` (+ `client.test.ts`), `src/auth/{AuthProvider,AuthGate,sessionBootstrap,authState,useAuth}.ts(x)` (+ `AuthProvider.test.tsx`, `AuthGate.test.tsx`), `src/onboarding/{OnboardingFlow,useOnboardingDraft,draftMapping,types}.ts(x)` (+ `OnboardingFlow.test.tsx`, `useOnboardingDraft.test.tsx`, `draftMapping.test.ts`), `src/PilotDisabledScreen.tsx`, `src/App.tsx`, `src/main.tsx`, `vitest.setup.ts`, `vitest.config.ts`.
- Contracts: `packages/contracts/src/{auth,onboarding}.ts`.
- Tests: `apps/api/test/authRoutes.test.ts` (logout/csrf/concurrent restore/invalid-Origin), miniapp `*.test.ts(x)`.

## Verification
- `npm run check` (typecheck + 99 unit tests + build across all workspaces): **green**.
  - miniapp: 52 tests (incl. component/hook/transport tests)
  - API: 35 tests
  - contracts: 11 tests
  - bot: 1 test
- PostgreSQL integration suite (21 tests) runs only in CI (`npm run db:test`); not executable in this sandbox.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- `git diff --check`: clean.
- `ENABLE_REAL_SUBMISSIONS` remains `false`; no identity fields reach public-draft requests/responses/storage.

## Remaining gates before merge
1. Re-confirm `main` branch protection/ruleset `20794921` in the repo (no force-push; both `check` + `integration` required).
2. Green CI **both** jobs (`check` + PostgreSQL 17 `integration`) on the final pushed head.
3. Independent re-review of the T3 corrective commits (no review-thread resolution until verified).
4. Operator-recorded evidence (pre-merge follow-up): synthetic Telegram test-bot e2e, narrow + wider responsive viewports, keyboard/focus/screen-reader checks. Covered by automated jsdom tests here; visual recordings remain a follow-up.
5. Update the PR #2 body to the final commit set and truthful current status only after code/evidence are complete.
6. Keep `ENABLE_REAL_SUBMISSIONS=false`; no out-of-scope feature added.

## Open questions resolved
- API origin: same-origin `/api` (Vite proxies to `localhost:4000`); no external proxy.
- CSRF model: non-rotating, derived from the session token (no stored plaintext, no per-restore invalidation).
- Mode detection: explicit Telegram launch signal (non-empty `initData`), not SDK-global presence.
- Save result: explicit `{ success, persisted }` so demo progression and real persisted completion are unambiguous.
