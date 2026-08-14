# Phase 02 — Mini App and API Integration — Working Context

Last updated: 2026-08-14 (Africa/Nairobi)
Status: corrective implementation prepared locally; **not approved, not merged**

## Objective and boundary

Connect the Telegram Mini App to opaque-cookie authentication and resumable public drafts while keeping browser demo mode synthetic and network-free. Real identity, verification-photo upload, submission, administrator review, live discovery, matching, messaging, contact reveal, and payment remain outside this phase and disabled.

`ENABLE_REAL_SUBMISSIONS=false` is binding for local, CI, and deployed synthetic-test environments.

## Review state

- PR #2: `phase2/miniapp-api-integration` → `main`.
- Base: `053fb6ecf9cbff72b2e2d052588d5250ffd7d773`.
- Last observed remote head: `8ee6278ed98b9db80fcfb3cc5f828fcbb1402864`.
- The first through fifth independent reviews returned REQUEST CHANGES / DO NOT MERGE.
- Fifth-review implementation commits prepared locally on top of `8ee6278`:
  - `8821254aa295ece40785daf77598c1ded6480c00` — client/auth/logout lifecycle;
  - `6f5ff508076376f43d8d4f9ff7274b2f036397ff` — onboarding action lifecycle, exact tests, and privacy copy;
  - `5f9f7363bda9e821e0868108de1a2a0a95e57cd8` — production CSP host configuration, range-aware CI, and operator template.
- These commits still require publication, exact-final-head CI, CodeRabbit, and independent re-review. No conversation may be resolved from local implementation alone.

## Implemented architecture

### Typed same-origin transport

- `apps/miniapp/src/api/client.ts` sends `credentials: "include"` to same-origin `/api` routes.
- Shared contracts validate outgoing public draft patches and all auth/session/draft success responses.
- Valid non-2xx error envelopes are parsed before any success-only status assertion.
- Network/body-stream errors are typed `NETWORK`; malformed bodies/envelopes are `INVALID_RESPONSE`.
- Logout accepts only 204 as successful revocation; the real 401 `UNAUTHENTICATED` path is preserved.

### Telegram authentication and terminal logout

- Only raw Telegram `initData` is accepted as the short-lived authentication input; `initDataUnsafe` is never trusted.
- The API verifies Telegram signature/freshness and extracts the validated Telegram ID and auth date.
- The browser receives an opaque HttpOnly cookie and a CSRF token; the opaque token is never exposed to JavaScript.
- `AuthProvider` orders bootstrap, Telegram exchange, recovery, invalidation, and logout through one operation tail.
- Recovery and invalidation are awaitable.
- Logout sets terminal intent synchronously, returns one shared promise, blocks later automatic recovery, and waits for earlier auth work.
- Logout always restores the final cookie-backed session before revocation. Stored CSRF is not treated as authoritative for the current cookie.
- Final GET 401 confirms absence. GET/logout network, 500, malformed, and body-read failures never produce a false “Signed out.”
- One bounded INVALID_CSRF refresh/retry is allowed; unresolved revocation stays visible and retryable.
- An auth request cannot begin after terminal logout intent. An exchange already active before intent is followed by final-session restoration and revocation.
- Signing out and failure are exposed with disabled/`aria-busy`/live-region semantics.

### Browser demo mode

- Mode detection requires non-empty Telegram launch `initData` for real mode.
- Browser demo uses synthetic local values only and makes zero API requests.
- Demo copy never claims persistence or live review/connection behavior.

### Resumable public drafts

- Only eligibility, public profile, faith/family, partner preferences, and an empty public-preview checkpoint reach `/v1/onboarding/draft`.
- Private identity, consent, verification-photo, Telegram, contact, cookie, and CSRF fields are excluded by mapping, contracts, route validation, and tests.
- Saves are serialized and awaitable with optimistic `expectedVersion` checks.
- `persisted=true` is derived only from a versioned server draft or confirmed write.
- Footer exit and completion consume the authoritative operation result, not stale render state.
- `reloadLatest` and initial retry load are shared, awaitable operations.
- Continue, Back, header/footer Exit, Reload latest, and load Retry use one synchronous action guard; form/navigation controls are disabled while an operation is pending.
- Conflict reload preserves edits/state when it fails and coherently replaces payload, version, persistence, conflict, and visible step when it succeeds.
- `reloadRevision` preserves the corrected same-valued server-step behavior.

### Privacy copy

The real preview distinguishes data sent to Kidan, data retained for authentication, fields placed in the public draft, and fields shown in discovery. It no longer uses an unqualified “no identity/contact details are shared” claim.

### CSP and same-origin host

- `apps/miniapp/src/lib/csp.ts` generates reviewed development and production policies.
- `apps/miniapp/vite.config.ts` applies policies to Vite development/preview only.
- `apps/miniapp/index.html` contains a supplemental meta policy; it is not relied on for `frame-ancestors`.
- `apps/miniapp/deploy/nginx.conf` is the production-serving candidate: static SPA + same-origin `/api` proxy + production CSP/security headers.
- `apps/miniapp/src/lib/csp.test.ts` requires the Nginx header to match the generated production policy exactly.
- No third-party font, tracker, analytics, pixel, ad, or replay source is present; the Telegram SDK is the only reviewed external Mini App origin.
- Deployment is still pending. A tracked Nginx file is not proof that the approved HTTPS host emits the header.

### CI hygiene

- PR jobs check out the exact PR head with full history.
- CI checks `pull_request.base.sha..HEAD`, not an empty working-tree diff.
- Push jobs check `before..HEAD` with a safe fallback.
- The current Vite EOF whitespace defect is removed.
- jsdom `scrollTo` and the Vite native-loader import warning are fixed, producing warning-clean local output.

## Exact deterministic coverage

The Mini App suite now includes:

- valid logout 204 and concurrent-already-absent 401;
- final-session network, valid 500, malformed, body-read, and unavailable-storage paths;
- stale token A vs. authoritative final token B;
- bounded INVALID_CSRF refresh/retry success and failure;
- shared deferred logout callers;
- logout during active GET/auth and same-tick retry/invalidate barriers;
- no Telegram auth start after terminal intent;
- announced logout busy/failure UI;
- first-save footer persistence result;
- deferred save/reload vs. header/footer/back/continue;
- same-tick Back+Continue;
- shared reload callers and reload-error state preservation;
- initial-load exit lock;
- original-server-step reload after local navigation;
- exactly five ordered real-mode PUTs with increasing versions and exact section-only bodies;
- intermediate/final save failure blocking;
- no private/consent/contact/auth fields in public requests, localStorage, or URLs;
- network-free complete demo flow;
- production CSP/Nginx drift.

## Local verification

- `npm ci`: passed (201 packages installed; 206 audited; 0 vulnerabilities).
- `npm run check`: green and warning-clean.
- Tests: **146 total**.
  - Mini App: 97
  - API: 37
  - Contracts: 11
  - Bot: 1
- All typechecks and production builds passed.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- Exact Phase 02 base-to-final-local-head `git diff --check`: clean.
- PostgreSQL integration remains CI-only in this sandbox and must pass on the exact final pushed SHA.

## Hard merge gates still open

1. Publish normal follow-up commits without force-push/history rewrite.
2. Run fresh exact-final-head Actions `check` and PostgreSQL 17 integration.
3. Deploy the exact final SHA to an approved HTTPS synthetic Telegram test host.
4. Verify the actual CSP response header and same-origin `/api`; test `frame-ancestors` in approved Telegram clients.
5. Complete the explicitly pending `docs/evidence/phase-02/OPERATOR_RECORD_TEMPLATE.md` with redacted synthetic evidence.
6. Cover first auth, restore, refresh, five writes, resume, two-client conflict, expiry/re-auth, logout, post-logout 401, and no accepted cookie after logout.
7. Cover narrow/wide viewports, safe areas, overflow, 200% text/zoom, reduced motion, keyboard/focus, and a real screen reader.
8. Prove `ENABLE_REAL_SUBMISSIONS=false` and zero forbidden data in network/storage/URL/log/analytics/evidence on that deployment.
9. Reconfirm active ruleset `20794921`, receive fresh CodeRabbit, and complete independent final-head review.
10. Resolve review threads only after verification.
11. Rewrite the PR body only when the final head, evidence, checks, counts, and review status are known.
12. Keep PR #2 open/unmerged until every gate is closed.

## Key files

- API auth/session: `apps/api/src/auth/{telegramInitData,sessionService}.ts`, `apps/api/src/routes/auth.ts`.
- API public drafts: `apps/api/src/routes/onboarding.ts`, `apps/api/src/onboarding/onboardingService.ts`.
- API persistence: `apps/api/src/persistence/{types,memoryRepository,postgresRepository}.ts`.
- Mini App transport: `apps/miniapp/src/api/client.ts` and `client.test.ts`.
- Mini App auth: `apps/miniapp/src/auth/{AuthProvider,AuthGate,AuthStatusBar,sessionBootstrap,authState,useAuth}.ts(x)` and adjacent tests.
- Mini App drafts: `apps/miniapp/src/onboarding/{OnboardingFlow,useOnboardingDraft,draftMapping,types}.ts(x)` and adjacent tests.
- Privacy copy: `apps/miniapp/src/PilotDisabledScreen.tsx` and test.
- CSP: `apps/miniapp/src/lib/csp.ts`, `csp.test.ts`, `apps/miniapp/index.html`, `apps/miniapp/vite.config.ts`.
- Production host candidate: `apps/miniapp/deploy/{nginx.conf,README.md}`.
- Operator gate: `docs/evidence/phase-02/{README.md,OPERATOR_RECORD_TEMPLATE.md}`.
- CI: `.github/workflows/ci.yml`.
- Contracts: `packages/contracts/src/{auth,onboarding}.ts`.

## Product constraints unchanged

- EOTC-only adult first release.
- Anonymous, values-only, photo-free discovery.
- No candidate social links.
- No chat before mutual decisions, administrator approval, and both final confirmations.
- Restricted in-app introduction before any future contact reveal.
- Verification photo remains private/admin-only with 30-day post-approval deletion.
- Pilot remains free; monetization ideas stay out of implementation.
