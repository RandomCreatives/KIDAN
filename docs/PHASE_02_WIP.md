# Phase 02 — Mini App and API Integration — Working Context

Last updated: 2026-08-17 (Africa/Nairobi)

Status: post-review corrections prepared locally; **not approved, not merged**

## Objective and boundary

Connect the Telegram Mini App to opaque-cookie authentication and resumable public drafts while keeping browser demo mode synthetic and network-free. Real identity, verification-photo upload, submission, administrator review, discovery, matching, messaging, contact reveal, and payment remain outside Phase 02 and disabled.

`ENABLE_REAL_SUBMISSIONS=false` is binding for local, CI, staging, and operator-test environments.

## Repository and review state

- PR #2: `phase2/miniapp-api-integration` → `main`.
- Base: `053fb6ecf9cbff72b2e2d052588d5250ffd7d773`.
- Last observed remote head/tree: `28ac6ac1e2f1f48f4d7de5608ce2c4cb67b6f236` / `8e8a921f4bc6bd1825977ffd2e59783e79aafa7e`.
- Exact-head Actions run `32022518353` passed both required jobs.
- Latest completed CodeRabbit review: `4949831122` against `e2d3e22`; automatic review of later commits was skipped pending a manual request.
- Two normal local commits are prepared directly on `28ac6ac`:
  - `369f025d221627becdd6c7880439f41595854d4d` — complete timeout/recovery/focus regressions;
  - `ac7b0468fc6fa69ec0bdc185af575ee2c3d02c05` — valid maintainability nitpicks and shared defaults.
- These commits are not pushed or reviewed. Keep PR #2 open and unmerged.

## Typed same-origin transport

- `KidanApiClient` sends `credentials: "include"` to same-origin `/api` routes.
- Shared contracts validate outgoing public-draft patches and every auth/session/draft success response.
- Valid non-2xx envelopes preserve declared server error codes; malformed responses fail closed as `INVALID_RESPONSE`.
- A configurable request-layer `AbortController` and one timer cover both `fetch()` and `response.text()`.
- Timeout aborts map to `ApiError("NETWORK", 0)` and always clear the timer.
- Deterministic fake-timer tests prove:
  - the request is pending before the configured deadline;
  - the client’s timer calls `controller.abort()`;
  - `signal.aborted` becomes true;
  - the same deadline remains active while the response body is pending.
- Logout accepts only 204 as confirmed revocation while preserving validated 401 already-absent handling.

## Authentication and gate behavior

- Only raw Telegram `initData` is accepted as short-lived authentication input.
- The API verifies signature and freshness before extracting Telegram identity data.
- Auth bootstrap, recovery, invalidation, and logout are ordered and single-flight where required.
- Logout establishes terminal intent synchronously, restores the final cookie-backed session, and never trusts stale browser CSRF state as proof of the current cookie.
- Final GET 401 and logout POST 401 are treated as validated already-absent outcomes; network, malformed, and server failures remain retryable and never falsely claim sign-out.
- A bounded `INVALID_CSRF` logout refresh/retry is supported.
- Auth gate focus is stable:
  - no-action status screens focus a programmatic heading once per displayed status;
  - actionable status screens focus their recovery button;
  - ordinary parent rerenders do not invoke a callback ref or steal focus.
- Temporary `NETWORK` failures remain `fatal`, which currently means recoverable **Connection error** with **Retry**. They are intentionally not mapped to non-recoverable **Account unavailable**.

## Resumable public drafts

- Only eligibility, public profile, faith/family, partner preferences, and the public-preview checkpoint reach the public-draft API.
- Saves are serialized and read the latest expected version when each queued request begins.
- Initial hydration applies the server resume step once.
- Explicit reload/retry handlers apply their returned step directly.
- `INVALID_CSRF` recovery may refresh authentication and rehydrate an older server draft, but cannot move an actively editing user backward.
- The regression test proves the full path: successful forward navigation, rejected save with `INVALID_CSRF`, second session/auth exchange with a new CSRF token, second draft GET returning the older step, and unchanged visible position.
- Conflict/reload, saving, and loading states disable conflicting form/navigation actions.
- Failed-save tests wait for the request, settled error state, and re-enabled controls.
- Demo progression asserts every exact step from 1 through 7 and makes zero network calls.

## Shared contracts and maintainability

- `ONBOARDING_SCHEMA_VERSION` and `INITIAL_ONBOARDING_STEP` are exported by `@kidan/contracts`.
- Contract schemas, the empty-draft route fallback, and Mini App save requests use the shared values.
- Auth error mapping accepts `ClientErrorCode`, and auth status labels are exhaustive over `AuthStatus`.
- `AuthProvider` lazily constructs one API client.
- The unused session-bootstrap error-body helper is removed.
- Draft merge and reset delegate to one validated payload-application helper.
- Hook tests expose actual form state and prove server payload hydration.
- Reload mapping tests match production defaults and prove omitted unsaved edits reset.
- Pilot-disabled tests cover both unsaved and saved public-draft copy.
- Auth-route tests use one setup factory while preserving explicit per-test cookie/origin options.
- The obsolete component save-timeout nitpick is superseded because the component race was removed entirely.

## Privacy and security boundary

- Public requests exclude private identity, full name, phone, date of birth, verification-photo data, consent, Telegram fields, session tokens, and CSRF values.
- Demo mode is synthetic and network-free.
- Real mode saves only public profile sections and truthfully states that verification, consent, review, discovery, and connections are disabled.
- `apps/miniapp/index.html` has no static CSP meta policy. Development/preview and production response headers are authoritative and environment-specific.
- The production Nginx candidate supplies same-origin `/api`, SPA routing, CSP, and security headers, but tracked configuration is not deployment evidence.

## CodeRabbit disposition

### Corrected

The seven valid actionable recommendations are implemented: merge-base hygiene, CSP composition, complete request timeout, stable focus, fixture precedence, settled deferred-save test, and initial-only resume behavior.

### Rejected literal mapping

The literal `NETWORK → unavailable` recommendation is rejected because `unavailable` currently means **Account unavailable** and supplies no recovery action. Regression coverage pins `NETWORK → fatal` and proves **Connection error + Retry** recovers successfully. This rationale must be posted in the review thread.

### Walkthrough `401` warning

The warning that logout 401 may not reach signed-out recovery is not reproducible. Valid final-session and logout 401 paths are tested and end in `unauthenticated`; malformed envelopes remain failures. Document this disposition rather than weakening logout truthfulness.

## Local verification

- `npm ci`: passed; 201 packages installed, 206 audited, 0 vulnerabilities.
- `npm run typecheck`: passed.
- `npm test`: **152 passed**:
  - Mini App: 102;
  - API: 37;
  - contracts: 12;
  - bot: 1.
- `npm run build`: passed.
- `npm audit --audit-level=low`: passed with 0 vulnerabilities.
- `git diff --check`: clean.
- PostgreSQL integration passed remotely at `28ac6ac` but must pass again on the published final head.

## Publication and remaining gates

1. Apply the generated mailbox `.txt` to exact head `28ac6ac` and push normally without history rewriting.
2. Require green exact-final-head Actions for typecheck/tests/build/audit/hygiene and PostgreSQL integration.
3. Post the network-mapping and logout-401 dispositions; resolve conversations only after verification.
4. Request a fresh CodeRabbit full review and complete independent final-head review.
5. Deploy the exact final SHA to an approved HTTPS synthetic Telegram host.
6. Verify actual response-header CSP, same-origin `/api`, Telegram auth/restore/recovery, five writes, resume, conflict/reload, expiry/re-auth, and logout/post-logout behavior.
7. Complete the redacted synthetic operator evidence template, including keyboard, focus, screen-reader, responsive, zoom/text, safe-area, overflow, and reduced-motion checks.
8. Prove `ENABLE_REAL_SUBMISSIONS=false` and absence of forbidden data in network, storage, URLs, logs, analytics, and evidence.
9. Reconfirm ruleset `20794921`, update the PR description with exact facts, and keep PR #2 unmerged until all gates close.

## Product constraints unchanged

- Adult Ethiopian Orthodox Tewahedo candidates only for the first release.
- Anonymous, values-only, photo-free discovery.
- No candidate social links.
- No chat before mutual decisions, administrator approval, and both final confirmations.
- Restricted in-app introduction before any future contact reveal.
- Verification photo remains private/admin-only with 30-day post-approval deletion.
- Pilot remains free; payment, wallet, credits, ratings, VIP, and paid verification remain unauthorized.
