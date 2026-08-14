# Agent Handoff

Last updated: 2026-08-14 (Africa/Nairobi)

## Current status

- Repository: `https://github.com/RandomCreatives/KIDAN`.
- `main` baseline remains `053fb6ecf9cbff72b2e2d052588d5250ffd7d773`; Phase 01 is complete.
- Phase 02 is being reviewed in PR #2 on `phase2/miniapp-api-integration`.
- The last observed remote PR head is `8ee6278ed98b9db80fcfb3cc5f828fcbb1402864`. It is open and unmerged.
- Four earlier reviews and the fifth review all returned **REQUEST CHANGES / DO NOT MERGE**. A green check is not approval.
- The fifth-review code corrections are prepared as normal local follow-up commits based on `8ee6278`:
  - `8821254aa295ece40785daf77598c1ded6480c00` — final-session, terminal, shared-promise logout/auth lifecycle;
  - `6f5ff508076376f43d8d4f9ff7274b2f036397ff` — authoritative save/exit, awaitable reload/action coordination, exact flow tests, and scoped privacy copy;
  - `5f9f7363bda9e821e0868108de1a2a0a95e57cd8` — production Nginx CSP configuration, policy drift test, evidence template, warning cleanup, and range-aware CI hygiene.
- These local commits have not been pushed, merged, approved, or used to resolve review conversations. Their implementation still requires fresh exact-final-head CI, CodeRabbit, and independent review.
- The real deployment/operator gate is **not complete**. `docs/evidence/phase-02/` contains an explicitly incomplete template, not evidence.
- `ENABLE_REAL_SUBMISSIONS` remains `false`. Keep it false on every test/deployment environment.

## Fifth-review implementation

### Authentication, session, and logout

- `apps/miniapp/src/api/client.ts` parses validated non-2xx error envelopes before applying a success-only expected-status assertion. The server's real logout `401 UNAUTHENTICATED` is preserved.
- `apps/miniapp/src/auth/AuthProvider.tsx` uses one ordered operation tail for bootstrap, recovery, invalidation, and logout.
- Logout establishes terminal intent synchronously, blocks later retry/invalidate work, and returns one shared `Promise<LogoutResult>` to all callers.
- After earlier auth work settles, logout always calls final cookie-backed `GET /v1/session`; it never trusts a stored CSRF value as proof of the current cookie.
- Final GET 200 supplies the authoritative CSRF. Final GET 401 confirms absence. Network, valid 500, malformed response, and body-read failures never claim sign-out.
- A logout `INVALID_CSRF` performs one bounded final-session refresh and one retry. Further failure remains authenticated/retryable with an announced error.
- A Telegram exchange already in flight before logout may settle, but logout then restores and revokes its final cookie. No Telegram exchange may start after terminal logout intent.
- `retry()` and `invalidate()` are awaitable. Generation checks suppress stale React commits but are not used as a substitute for ordering cookie side effects.
- `AuthStatusBar` exposes disabled/`aria-busy` signing-out semantics and announced unconfirmed failure.

### Public-draft lifecycle

- `saveProgress` returns the authoritative `{ success, persisted }` result. Footer exit uses `result.persisted`, so a first confirmed write reports saved.
- `reloadLatest` and initial retry load return shared, awaitable `DraftLoadResult` promises.
- Continue, Back, footer/header Exit, reload, and loading retry use one synchronous action guard; save/reload content is disabled while pending.
- Conflict reload preserves state on failure and coherently reapplies payload, version, persistence, and server step on success.
- Completion stores the final write's persistence result rather than reading a stale render.
- The real five-step regression proves exactly five sequential public-only PUTs with versions 2→7: eligibility, public profile, faith/family, partner preferences, and the empty public-preview checkpoint.
- Tests prove request bodies exclude private identity, consent, phone/name/date of birth/photo, Telegram fields, session token, and CSRF.
- Browser demo mode remains synthetic and network-free.

### Privacy copy

`PilotDisabledScreen` now distinguishes:

1. Telegram launch data sent to Kidan for authentication;
2. validated Telegram ID/authentication date retained for account/session security;
3. Telegram names/usernames excluded from the public draft and discovery;
4. Kidan private identity, verification-photo, and submission-consent collection remaining disabled in the preview.

### CSP and hosting configuration

- `apps/miniapp/src/lib/csp.ts` remains the reviewed policy generator.
- `apps/miniapp/vite.config.ts` sends development/preview headers and imports the policy with an explicit `.ts` extension without native-loader warnings.
- `apps/miniapp/deploy/nginx.conf` is a complete same-origin production-serving candidate. It emits the matching CSP and proxies `/api/` to `kidan-api:4000`.
- `apps/miniapp/src/lib/csp.test.ts` prevents the generated production policy and Nginx header from drifting.
- The meta policy in `apps/miniapp/index.html` is supplemental and does not replace the response header.
- **Still pending:** adopt the configuration on an approved HTTPS host and capture the actual response header/source inventory on the exact final SHA. A config file is not deployment evidence.

### CI hygiene

- `.github/workflows/ci.yml` now checks out the exact PR head with full history.
- Pull requests run `git diff --check <pull-request-base>..HEAD`; pushes use the before SHA with a safe `HEAD^` fallback.
- The compared SHAs are printed in CI logs.
- The prior blank line at EOF in `apps/miniapp/vite.config.ts` is removed.
- jsdom stubs `window.scrollTo`; the Vite extension warning is fixed rather than suppressed.

## Local verification after fifth-review code and documentation changes

- `npm ci`: passed (201 packages installed; 206 audited; 0 vulnerabilities).
- `npm run check`: **green and warning-clean**.
  - Mini App: 97 tests
  - API: 37 tests
  - Contracts: 11 tests
  - Bot: 1 test
  - Total: **146 unit tests**
  - All typechecks and production builds passed.
- `npm audit --audit-level=low`: passed with 0 vulnerabilities.
- `git diff --check 053fb6ecf9cbff72b2e2d052588d5250ffd7d773..<final-local-head>`: clean.
- The PostgreSQL integration suite remains unchanged and cannot run in this sandbox; it must pass in exact-final-head CI.

## Hard gates still open

1. Push the normal follow-up commits without rebasing/force-pushing the PR branch.
2. Deploy the exact final SHA to an approved HTTPS synthetic Telegram test host using the reviewed same-origin/CSP configuration.
3. Complete `docs/evidence/phase-02/OPERATOR_RECORD_TEMPLATE.md` using synthetic data only; redact all secrets and personal identifiers.
4. Verify Telegram first auth, restore/refresh, five writes, resume, two-client conflict/reload, expiry/re-auth, logout, post-logout 401, and no accepted cookie after logout.
5. Record narrow/wide responsive, safe-area, overflow, 200% text/zoom, reduced-motion, keyboard/focus, and real screen-reader results.
6. Prove `ENABLE_REAL_SUBMISSIONS=false` on that deployment and prove no forbidden data appears in draft/network/storage/URL/log/analytics/evidence.
7. Obtain fresh exact-final-head GitHub Actions (`check` and PostgreSQL integration), CodeRabbit, active-ruleset confirmation, and independent review.
8. Resolve conversations only after the exact final source/evidence satisfies each one.
9. Update the PR body only after the final head, evidence, counts, CI, and review are known.
10. Approve/merge only as a separate final decision after every gate closes.

## Active repository protection

Ruleset `20794921` was last independently confirmed active on 2026-08-14. It requires:

- `Typecheck, unit tests, build, audit`;
- `PostgreSQL integration tests`;
- strict up-to-date checks;
- pull-request review-thread resolution;
- no deletion or non-fast-forward update of protected `main`.

Re-confirm the ruleset on the exact final head; do not describe it as unconfigured repository administration.

## Locked product/privacy scope

- Adult Ethiopian Orthodox Tewahedo candidates only for the first release.
- Values-only, photo-free anonymous discovery.
- No social-media links in candidate profiles.
- Name and phone remain hidden; no contact reveal is implemented.
- Verification photo, when later authorized, is admin-only and scheduled for deletion 30 days after approval.
- Mutual interest + administrator approval + both final confirmations may later open only a restricted in-app introduction.
- Initial controlled pilot remains free. Payment, wallet, credits, ratings, VIP, and paid verification are not authorized.
- Real identity/photo/submission/admin/discovery/matching/messaging/contact/payment implementation remains outside Phase 02 and disabled.

## Durable Phase 01 facts

- Phase 01 final baseline is `053fb6e`; PostgreSQL 17 integration passed in Actions.
- Public codes use `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.
- PostgreSQL stores hashed opaque sessions and encrypted Telegram/private identity values.
- Public drafts are isolated per user and use optimistic versions.
- No user route can self-approve a profile.
- Production database location, legal basis, retention, and Ethiopian data-residency controls remain unresolved before real-user launch.
