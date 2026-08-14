# Phase 02 — Working Context (resume point)

Last updated: 2026-08-14
Purpose: precise resume notes so work can continue without re-deriving context.

## Current repo state
- Phase 01 is complete and verified in CI (commit `90614b4`, cleanup `053fb6e`). CI green: `check` + `integration` jobs pass. `ENABLE_REAL_SUBMISSIONS` remains `false`.
- We are on **Phase 02 — Mini App and API Integration** (`phase2/miniapp-api-integration`).
- **First independent review** (`PR_02_REQUEST_CHANGES.txt`, RC-01…RC-08) was reworked and pushed as normal follow-up commits (head `d819365`).
- **Second independent review** (`PR_02_SECOND_REVIEW_REQUEST_CHANGES.txt`, R2-01…R2-09) found the prior head still unsafe and listed nine findings. Reworked and pushed as normal follow-up commits (head `8f1d945`).
- **Third independent review** (`PR_02_THIRD_REVIEW_REQUEST_CHANGES.txt`, T3-01…T3-07) on head `8f1d945` reproduced two regressions introduced while fixing R2 (demo could not advance; real final "Save draft" sent no PUT) and required a truthful rework plus a complete test/evidence matrix. All T3 findings are addressed on normal follow-up commits on top of `8f1d945` (see `git log` on the branch for exact SHAs). The branch is **not merged**.
- **Fourth independent review** (`PR_02_FOURTH_REVIEW_REQUEST_CHANGES.txt`, T4-01…T4-08) on head `d63dd90` returned REQUEST CHANGES (DO NOT MERGE). It reproduced the R2 logout/serialization defect and added: unified nav lock + reload revision (T4-03/T4-04), a CSP **response header** (not just a meta tag) delivered by the same-origin host (T4-07), accurate `PilotDisabledScreen` privacy copy (T4-06), complete tests for every finding (T4-05), and truthful docs/counts/file-path prefixes (T4-08). All T4 findings addressed on normal follow-up commits. The branch is **not merged** and **must not be merged** until fresh CI (check + PostgreSQL 17 integration) passes, ruleset `20794921` is re-confirmed, the fourth-review threads are truthfully resolved, and operator-recorded Telegram/responsive/screen-reader visual evidence is supplied.
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

## Fourth review — T4-01…T4-08 (head `d63dd90`, addressed on normal follow-up commits)
- **T4-01 — CRITICAL — truthful single-flight logout:** `apps/miniapp/src/api/client.ts` `logout()` now requires HTTP **204** (`request` gained `expectStatus`); any non-204 (network failure, 500, malformed) throws and is NOT treated as success. `apps/miniapp/src/auth/AuthProvider.tsx` `logout` is single-flight (`logoutInFlightRef`) and only transitions to `unauthenticated` after a confirmed 204 (or an already-absent 401 `UNAUTHENTICATED`). On failure it keeps `authenticated` and sets a `logoutError` so the user is never silently stuck signed-out. Tests: 204 success, already-absent, network-fail then retry success, 500 keeps authenticated, malformed non-204, `INVALID_CSRF` recovery, repeated-click single-flight.
- **T4-02 — CRITICAL — serialized auth lifecycle:** `bootstrap`/`commit`/`logout`/`invalidate` share one `authMutex` (`runExclusive`); a stale post-logout bootstrap can no longer return the provider to authenticated; `invalidate` is serialized through the same mutex. Tests: logout awaits an in-flight bootstrap; retry-after-bootstrap does not double `authenticateWithTelegram`.
- **T4-03 — MAJOR — unified nav action lock:** `apps/miniapp/src/onboarding/OnboardingFlow.tsx` `requestExit(force)` is guarded by a synchronous `actionLockRef` shared by the header X and footer Exit so a save-in-flight cannot be bypassed; `goBack` is likewise guarded; a `handleReload` path is guarded. Tests: header-exit during save no-op, idle header exit works, failed save does not exit, footer-exit during save no-op, conflict-reload reapplies server step.
- **T4-04 — MAJOR — coherent reload:** `apps/miniapp/src/onboarding/useOnboardingDraft.ts` exposes `reloadRevision` (bumped on `loadDraft` and `reloadLatest`); `OnboardingFlow` resume effect depends on `reloadRevision` so a reload re-applies the server step deterministically. A real 5-step click-through test hydrates with `syntheticOnboardingState` and asserts the persisted draft returns to the public-preview step.
- **T4-05 — MAJOR — complete tests:** fixed a mislabeled persisted-state test (version>0 payload → `persisted===true` with **no** PUT), added a fresh-draft test, wrapped `saveProgress` in `act`, and added click-through + logout-race + malformed-envelope + invalid-Origin + every-auth-gate-state regression coverage.
- **T4-06 — MAJOR — accurate privacy copy:** `apps/miniapp/src/PilotDisabledScreen.tsx` line 28 now states the launch credential is required for authentication and that no verification identity, phone number, or contact details are shared; added `PilotDisabledScreen.test.tsx` asserting the accurate copy.
- **T4-07 — MAJOR — CSP response header:** added `apps/miniapp/src/lib/csp.ts` (`kidanCspPolicy` for `development`/`production`), wired a Vite dev/preview plugin in `apps/miniapp/vite.config.ts` that sets `Content-Security-Policy` on responses (same-origin + reviewed `https://telegram.org` SDK host, `frame-ancestors 'none'`, `object-src 'none'`, `block-all-mixed-content`, no `unsafe-eval`), added a matching CSP meta tag in `apps/miniapp/index.html`, and added `apps/miniapp/src/lib/csp.test.ts`. The host (Nginx/static/CDN) **must** also send this header in production; the meta tag alone cannot enforce `frame-ancestors`.
- **T4-08 — MAJOR — truthful docs:** `docs/HANDOFF.md` and this file corrected — prior reviews did **not** "pass" (each returned REQUEST CHANGES/DO NOT MERGE); test counts are now accurate (122: 73 miniapp, 37 API, 11 contracts, 1 bot); `apps/api/` and `apps/miniapp/` file-path prefixes restored; operator-recorded Telegram/responsive/screen-reader visual evidence is restated as a **hard pre-merge gate**, not optional.

## Key files
- API (`apps/api/`): `src/auth/sessionService.ts`, `src/persistence/{types,memoryRepository,postgresRepository}.ts`, `src/routes/{auth,onboarding}.ts`, `src/onboarding/onboardingService.ts`, `src/app.ts` (origin check).
- Mini App (`apps/miniapp/`): `src/api/client.ts` (+ `client.test.ts`), `src/auth/{AuthProvider,AuthGate,sessionBootstrap,authState,useAuth}.ts(x)` (+ `AuthProvider.test.tsx`, `AuthGate.test.tsx`), `src/onboarding/{OnboardingFlow,useOnboardingDraft,draftMapping,types}.ts(x)` (+ `OnboardingFlow.test.tsx`, `useOnboardingDraft.test.tsx`, `draftMapping.test.ts`), `src/lib/csp.ts` (+ `csp.test.ts`), `src/PilotDisabledScreen.tsx` (+ `PilotDisabledScreen.test.tsx`), `src/App.tsx`, `src/main.tsx`, `vite.config.ts` (CSP dev/preview header), `index.html` (CSP meta), `vitest.setup.ts`, `vitest.config.ts`.
- Contracts (`packages/contracts/`): `src/{auth,onboarding}.ts`.
- Tests: `apps/api/test/authRoutes.test.ts` (logout/csrf/concurrent restore/invalid-Origin), miniapp `*.test.ts(x)`.

## Verification
- `npm run check` (typecheck + 122 unit tests + build across all workspaces): **green**.
  - miniapp: 73 tests (incl. component/hook/transport/route/CSP tests)
  - API: 37 tests
  - contracts: 11 tests
  - bot: 1 test
- PostgreSQL integration suite (21 tests) runs only in CI (`npm run db:test`); not executable in this sandbox.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- `git diff --check`: clean.
- `ENABLE_REAL_SUBMISSIONS` remains `false`; no identity fields reach public-draft requests/responses/storage.

## Remaining gates before merge
1. Re-confirm `main` branch protection/ruleset `20794921` in the repo (no force-push; both `check` + `integration` required).
2. Green CI **both** jobs (`check` + PostgreSQL 17 `integration`) on the final pushed head.
3. Independent re-review of the T4 corrective commits (no review-thread resolution until verified; the fourth review's threads must be truthfully resolved).
4. Operator-recorded evidence is a **hard pre-merge gate** (sandbox cannot produce it): synthetic Telegram test-bot e2e, narrow + wider responsive viewports, keyboard/focus/screen-reader checks. Automated jsdom logic tests here are necessary but **not sufficient**; the recordings must be supplied before merge.
5. Update the PR #2 body to the final commit set and truthful current status only after code/evidence are complete.
6. Keep `ENABLE_REAL_SUBMISSIONS=false`; no out-of-scope feature added.

## Open questions resolved
- API origin: same-origin `/api` (Vite proxies to `localhost:4000`); no external proxy.
- CSRF model: non-rotating, derived from the session token (no stored plaintext, no per-restore invalidation).
- Mode detection: explicit Telegram launch signal (non-empty `initData`), not SDK-global presence.
- Save result: explicit `{ success, persisted }` so demo progression and real persisted completion are unambiguous.
