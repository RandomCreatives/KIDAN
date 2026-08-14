# Phase 02 — Working Context (resume point)

Last updated: 2026-08-13
Purpose: precise resume notes so work can continue without re-deriving context.

## Current repo state
- Phase 01 is complete and verified in CI (commit `90614b4`, cleanup `053fb6e`). CI green: `check` + `integration` jobs pass. `ENABLE_REAL_SUBMISSIONS` remains `false`.
- We are on **Phase 02 — Mini App and API Integration** (`phase2/miniapp-api-integration`), reworking PR #2 per the independent REQUEST CHANGES review (`PR_02_REQUEST_CHANGES.txt`): six blockers (RC-01…RC-05, RC-06 major, RC-07 major, RC-08 major).
- Branch protection on `main`: reviewer reported ruleset `20794921` active and strict — **re-confirm in the repo** before merge. Recorded in `docs/HANDOFF.md`.
- This sandbox has **no PostgreSQL and no Telegram test bot**, so the e2e Telegram flow and the PostgreSQL integration suite (`npm run db:test`) cannot execute here. Client, auth-state machine, draft integration, and pure logic are buildable and unit/component-logic testable. The PostgreSQL integration suite is CI-only.

## Resolved findings (this rework)
- **RC-02 — CSRF race-safety:** `SessionService.rotateCsrf`/`updateSessionCsrf` removed. CSRF is now **derived deterministically** from the session token (`deriveCsrfToken`, `session:${token}` HMAC → base64url) and restored without rotation (`restoreSession`). Concurrent restores on one session all compute the same valid token; revoked/expired sessions yield no token. Opaque HttpOnly cookie unchanged. Memory + Postgres repos drop `updateSessionCsrf`.
- **RC-03 — Auth races / gate / logout:** `AuthProvider` uses a monotonic `opIdRef` single-flight bootstrap; only the newest operation commits. `resolveSession` (pure, testable in `sessionBootstrap.ts`) decides restore-vs-authenticate. `AuthGate` mounts app content only when `authenticated`; otherwise renders loading / signed-out / expired / unavailable / fatal screens with retry. `authenticating` state shown while exchanging init data. Logout succeeds only after server revocation (204); transport/CSRF failures show a retryable error and do **not** claim sign-out. `invalidate()` clears CSRF + form memory; AuthGate unmounts children on expiry. `profileStatus` typed from the shared contract.
- **RC-05 — Mode separation:** Demo is a persistent, network-free banner and renders only synthetic screens. Telegram mode never renders synthetic discovery/connections/verified/review; it shows authenticated public-draft work plus a truthful `PilotDisabledScreen` ("nothing beyond your public draft was transmitted"). Onboarding hides private-identity/consent steps and synthetic sample-fill controls in real mode and uses truthful "Draft saved / Preview only" copy.
- **RC-01 + RC-04 — Drafts:** Saves send **section-specific partial patches** (`buildSectionPatch`) validated by `onboardingProgressPatchSchema` (sections are now `.partial()`, so incomplete sections save). `OnboardingService.saveProgress` **deep-merges** sections so partial saves never overwrite sibling fields. Hydration is gated on authenticated CSRF; failed GET shows a retryable load screen (does not silently claim ready). Saves are serialized via a promise chain reading `expectedVersion` at execution; 409 blocks further writes until explicit reload. 401 → `invalidate()`; `INVALID_CSRF` → re-restore. Exposes `hydrated/loadError/saving/saveError/conflict`.
- **RC-06 — Runtime validation:** `KidanApiClient` parses every response with its method-specific shared schema (`sessionStatusSchema`, `draftResponseSchema`, `draftSaveResponseSchema`, `telegramAuthResponseSchema`) and fails closed (`INVALID_RESPONSE`) on malformed bodies/unknown codes. Outgoing draft patches are validated before send. `apiErrorCodeSchema` now types `apiErrorSchema.code`; `draftResponseSchema.schemaVersion` is a literal and `payload` is the public-only `partialPublicOnboardingPayloadSchema`.
- **RC-07 — Tests:** Added `sessionBootstrap` (restore/authenticate/unavailable/error decisions + stale-result shape), client response/request validation (204, malformed body, unknown code, invalid outgoing patch), `buildSectionPatch` (one section only), API route partial-save + deep-merge + identity-key exclusion, and PostgreSQL restore stability. **Gap:** component/hook *render* tests are absent because `@testing-library/react` is not installed in this workspace; defenses are covered via pure-logic tests and the gating contract in `AuthGate`.
- **RC-08 — Docs:** `docs/HANDOFF.md` and this file updated to the final implementation.

## Key files
- API: `src/auth/sessionService.ts`, `src/persistence/{types,memoryRepository,postgresRepository}.ts`, `src/routes/{auth,onboarding}.ts`, `src/onboarding/onboardingService.ts`.
- Mini App: `src/api/client.ts`, `src/auth/{AuthProvider,AuthGate,AuthStatusBar,sessionBootstrap,authState,useAuth}.ts(x)`, `src/onboarding/{OnboardingFlow,useOnboardingDraft,draftMapping,types}.ts(x)`, `src/App.tsx`, `src/main.tsx`, `src/PilotDisabledScreen.tsx`.
- Contracts: `packages/contracts/src/{auth,onboarding}.ts` (`partialPublicOnboardingPayloadSchema`, tightened `apiError`/`draftResponse`).

## Verification (run in sandbox)
- `npm run typecheck`, `npm run test`, `npm run build` (all pass).
- `npm run check` (typecheck + unit + build) passes; audit 0 vulns; `git diff --check` clean.
- Integration (`npm run db:test`) and full Telegram e2e require PostgreSQL + a test bot — CI-only here.

## Remaining gates before merge
1. Re-confirm `main` branch protection/ruleset `20794921` in the repo.
2. Green CI `check` **and** `integration` (PostgreSQL 17) on the pushed head.
3. (Optional, recommended) Add `@testing-library/react` + jsdom and component/hook render tests for `AuthGate`, `AuthProvider` single-flight, and `useOnboardingDraft` hydration/save/conflict.
4. Keep `ENABLE_REAL_SUBMISSIONS=false`; no out-of-scope feature added.

## Open questions resolved
- API origin: same-origin `/api` (Vite proxies to `localhost:4000`); no external proxy.
- CSRF model: non-rotating, derived from the session token (no stored plaintext, no per-restore invalidation).
