# Phase 02 — Working Context (resume point)

Last updated: 2026-08-14
Purpose: precise resume notes so work can continue without re-deriving context.

## Current repo state
- Phase 01 is complete and verified in CI (commit `90614b4`, cleanup `053fb6e`). CI green: `check` + `integration` jobs pass. `ENABLE_REAL_SUBMISSIONS` remains `false`.
- We are on **Phase 02 — Mini App and API Integration** (`phase2/miniapp-api-integration`).
- **First independent review** (`PR_02_REQUEST_CHANGES.txt`, RC-01…RC-08) was reworked and pushed as normal follow-up commits (head `d819365`).
- **Second independent review** (`PR_02_SECOND_REVIEW_REQUEST_CHANGES.txt`, R2-01…R2-09) found the prior head still unsafe and listed nine findings. Per its delivery plan, we push **normal follow-up commits only** — no force-push, no history rewrite, no review-thread resolution, no merge — then await fresh CI and an independent re-review.
- Branch protection on `main`: reviewer reported ruleset `20794921` active and strict — **re-confirm in the repo** before merge. Recorded in `docs/HANDOFF.md`.
- This sandbox has **no PostgreSQL and no Telegram test bot**. The PostgreSQL integration suite (`npm run db:test`) and live Telegram e2e cannot execute here; they run in CI. Component/hook/transport logic is now covered by `@testing-library/react` + `jsdom` tests in this workspace.

## Resolved findings (first round — RC-01…RC-08, head `d819365`)
- **RC-02 — CSRF race-safety:** `rotateCsrf`/`updateSessionCsrf` removed; CSRF derived deterministically from the session token (`deriveCsrfToken`, `restoreSession`). Concurrent restores compute the same token.
- **RC-03 — Auth gate/logout:** `AuthProvider` single-flight (`opIdRef`); `resolveSession` pure; `AuthGate` mounts only when `authenticated`; logout succeeds only after server revocation.
- **RC-05 — Mode separation:** demo = persistent network-free banner + synthetic screens; Telegram mode = authenticated public-draft work + truthful `PilotDisabledScreen`.
- **RC-01 + RC-04 — Drafts:** section-specific partial patches (`buildSectionPatch`) + server deep-merge; hydration gated; serialized saves; 409 blocks writes; 401/`INVALID_CSRF` recovery.
- **RC-06 — Runtime validation:** `KidanApiClient` parses responses with shared schemas, fails closed.
- **RC-07 — Tests:** `sessionBootstrap`, client validation, `buildSectionPatch`, API partial-save, Postgres restore.
- **RC-08 — Docs:** HANDOFF + this file updated.

## Resolved findings (second round — R2-01…R2-09)
- **R2-01 — Bound client methods:** `AuthProvider` passes closures (`() => client.getSession()`, `(initData) => client.authenticateWithTelegram(initData)`), eliminating the unbound-`this` TypeError on real Telegram auth. Covered by `AuthProvider.test.tsx`.
- **R2-05 — True single-flight + truthful logout:** `AuthProvider` shares one in-flight bootstrap promise; a `generationRef` aborts stale results on `invalidate`/logout. Logout with a missing CSRF **restores the session then revokes** and never claims success unless the server confirms revocation.
- **R2-06 — Typed transport:** `request` converts network failures → `ApiError("NETWORK")` and malformed/non-JSON bodies → `ApiError("INVALID_RESPONSE")`; parses error envelopes with `apiErrorEnvelopeSchema`; preserves known codes even without `requestId`. Auth/draft routes **validate every success response** against shared contracts and fail closed on `INTERNAL_ERROR`. Added `NETWORK` to `apiErrorCodeSchema`.
- **R2-02 — Drafts tied to navigation:** `saveProgress` is awaitable and returns success/failure; `OnboardingFlow` awaits it and only advances/completes after the queued save settles; Continue/Back/Exit/completion are disabled while saving or conflicted.
- **R2-03 — Resume + discard:** hydration resumes at the server `currentStep` (`serverStepToClientStep`); `reloadLatest` discards unsaved public edits from clean defaults (`resetFormFromPayload`); conflict blocks writes/navigation until recovery.
- **R2-04 — Truthful mode/copy:** mode selected from an explicit launch signal (non-empty Telegram `initData`); `PublicPreview` is mode-aware (no fake "Admin verified"/synthetic code/"exactly what discovery will show"); `PilotDisabledScreen` is tied to actual save state and scopes the transmission claim.
- **R2-07 — Tests:** added `@testing-library/react` + `jsdom`; `AuthProvider` (bound methods, single-flight, invalidate), `OnboardingFlow` (demo zero-fetch, real resume), `useOnboardingDraft` (awaitable save + conflict), plus API route tests (invalid-CSRF/missing-session logout, concurrent restore) and client transport tests.
- **R2-08 — Styles + a11y:** new auth/demo/conflict/pilot states have styles + ARIA live regions; `prefers-reduced-motion` honored.
- **R2-09 — Docs:** HANDOFF + this file now describe the actual implementation and remaining gates.

## Key files
- API: `src/auth/sessionService.ts`, `src/persistence/{types,memoryRepository,postgresRepository}.ts`, `src/routes/{auth,onboarding}.ts`, `src/onboarding/onboardingService.ts`.
- Mini App: `src/api/client.ts`, `src/api/client.test.ts`, `src/auth/{AuthProvider,AuthGate,AuthStatusBar,sessionBootstrap,authState,useAuth}.ts(x)` (+ `AuthProvider.test.tsx`), `src/onboarding/{OnboardingFlow,useOnboardingDraft,draftMapping,types}.ts(x)` (+ `OnboardingFlow.test.tsx`, `useOnboardingDraft.test.tsx`, `draftMapping.test.ts`), `src/PilotDisabledScreen.tsx`, `src/App.tsx`, `src/main.tsx`.
- Contracts: `packages/contracts/src/{auth,onboarding}.ts`.
- Tests: `apps/api/test/authRoutes.test.ts` (logout/csrf/concurrent restore), miniapp `*.test.ts(x)`.

## Verification
- `npm run check` (typecheck + 87 unit tests + build across all workspaces): **green**.
  - miniapp: 40 tests (incl. 9 new component/hook/transport tests)
  - API: 35 tests
  - contracts: 11 tests
  - bot: 1 test
- `npm audit --audit-level=low`: 0 vulnerabilities.
- `git diff --check`: clean.
- `ENABLE_REAL_SUBMISSIONS` remains `false`; no identity fields reach public-draft requests/responses/storage.

## Remaining gates before merge
1. Re-confirm `main` branch protection/ruleset `20794921` in the repo (no force-push; both `check` + `integration` required).
2. Green CI **both** jobs (`check` + PostgreSQL 17 `integration`) on the new pushed head.
3. Independent re-review of the R2 corrective commits (no thread resolution until verified).
4. Operator-recorded evidence (pre-merge follow-up, not blocking code): synthetic Telegram test-bot e2e, narrow + wider responsive viewports, keyboard/focus/screen-reader checks. These are covered by automated jsdom tests here; visual recordings remain a follow-up.
5. Keep `ENABLE_REAL_SUBMISSIONS=false`; no out-of-scope feature added.

## Open questions resolved
- API origin: same-origin `/api` (Vite proxies to `localhost:4000`); no external proxy.
- CSRF model: non-rotating, derived from the session token (no stored plaintext, no per-restore invalidation).
- Mode detection: explicit Telegram launch signal (non-empty `initData`), not SDK-global presence.
