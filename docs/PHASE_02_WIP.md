# Phase 02 — Mini App and API Integration — Working Context

Last updated: 2026-08-17 (Africa/Nairobi)

Status: final review follow-up prepared locally; **not approved, not merged**

## Objective and boundary

Connect the Telegram Mini App to opaque-cookie authentication and resumable public drafts while keeping browser demo mode synthetic and network-free. Real identity, verification-photo upload, submission, administrator review, discovery, matching, messaging, contact reveal, and payment remain outside Phase 02 and disabled.

`ENABLE_REAL_SUBMISSIONS=false` is binding for local, CI, staging, and operator-test environments.

## Repository and review state

- PR #2: `phase2/miniapp-api-integration` → `main`.
- PR base: `053fb6ecf9cbff72b2e2d052588d5250ffd7d773`.
- Last observed remote head/tree: `bb9881b0853fb8d0999b94de2dcd6a7f7fe3a25f` / `be113785f43af90b1f001300763127894bdc6ad8`.
- Actions run `32035252158` on `bb9881b` passed typecheck, 153 tests, builds, audit, and PostgreSQL integration. Its required main job still failed because diff hygiene found a blank EOF line in `AuthGate.tsx`.
- CodeRabbit full review `4951473057` covered exact head `c6b9255` and reported six inline findings plus six summary nitpicks.
- `bb9881b` addressed part of that review. The additive local follow-up on `bb9881b` completes the remaining valid work and repairs diff hygiene.
- Keep PR #2 open and unmerged until the follow-up is published, exact-final-head checks and review pass, conversations are resolved, the PR body is corrected, and external evidence is complete.

## Typed same-origin transport

- `KidanApiClient` sends `credentials: "include"` to same-origin `/api` routes.
- Shared contracts validate outgoing public-draft patches and every auth/session/draft success response.
- Valid non-2xx envelopes preserve declared server error codes; malformed responses fail closed as `INVALID_RESPONSE`.
- A configurable request-layer `AbortController` and one timer cover both `fetch()` and `response.text()`.
- Timeout, fetch, and response-body transport failures map to `ApiError("NETWORK", 0)` and always clear the timer.
- Deterministic fake-timer tests prove the deadline aborts stalled fetches and stalled response-body reads.
- Logout accepts only 204 as confirmed revocation while preserving validated 401 already-absent handling.

## Authentication and gate behavior

- Only raw Telegram `initData` is accepted as short-lived authentication input.
- The API verifies signature and freshness before extracting Telegram identity data.
- Auth bootstrap, recovery, invalidation, and logout are ordered and single-flight where required.
- Logout establishes terminal intent synchronously, restores the final cookie-backed session, and never trusts stale browser CSRF state as proof of the current cookie.
- Logout uses one loop bounded to two revocation attempts. Only the first `INVALID_CSRF` may refresh the final session token.
- Final GET 401 and logout POST 401 are validated already-absent outcomes; network, malformed, and server failures remain retryable and never falsely claim sign-out.
- Auth gate focus is stable: no-action screens focus the heading, actionable screens focus the recovery button, and ordinary rerenders do not steal focus.
- Temporary `NETWORK` failures remain `fatal`, which currently means recoverable **Connection error** with **Retry**. They are intentionally not mapped to non-recoverable **Account unavailable**.
- The obsolete duplicate logout footer is removed. The remaining logout alert is outside the polite status live region to prevent duplicate assistive-technology announcements.

## Resumable public drafts

- Only eligibility, public profile, faith/family, partner preferences, and the public-preview checkpoint reach the public-draft API.
- Saves are serialized and read the latest expected version when each queued request begins.
- Every section patch is parsed with `partialPublicOnboardingPayloadSchema`; invalid patch construction fails instead of relying on unsafe casts.
- Save failures return typed feedback to the component, with a fallback message for unexpected failures.
- Initial hydration applies the server resume step once. Explicit reload/retry handlers apply their returned step directly.
- Authoritative reload starts from clean defaults, discarding omitted unsaved local edits. The regression test passes a dirty state and proves the omitted city resets.
- `INVALID_CSRF` recovery may refresh authentication and rehydrate an older server draft, but cannot move an actively editing user backward.
- Conflict/reload, saving, and mutation states disable competing actions. Initial loading does not trap the user: forced exit remains available.
- Demo progression asserts every exact step from 1 through 7 and makes zero network calls.

## Persistence and public-contract boundary

- Persistence JSON is treated as untrusted input.
- `OnboardingService.getDraft` canonicalizes stored payloads through `partialPublicOnboardingPayloadSchema` before returning them.
- `saveProgress` canonicalizes the current stored payload before merging and validates the merged payload again before persistence.
- Unknown legacy keys are deliberately removed rather than exposed by broadening the public response schema.
- Invalid values fail closed; the GET route preserves the validated `INTERNAL_ERROR` envelope and records a server-side contract-validation error.
- Tests prove unknown top-level and nested keys do not leak and are removed on the next save.

## CSP and deployment boundary

- `apps/miniapp/index.html` has no cumulative static CSP meta policy.
- Development/preview and production response headers are authoritative and environment-specific.
- The reviewed host helper compares script hosts with a supplied application host and separately permits `telegram.org`; it does not equate `localhost` with CSP `'self'`.
- The production Nginx candidate supplies same-origin `/api`, SPA routing, CSP, and security headers, but tracked configuration is not deployment evidence.

## Review `4951473057` disposition

### Inline findings

1. Persisted payload/schema mismatch: corrected by canonicalizing persistence through the public allowlist; the literal suggestion to expose unknown fields is rejected on privacy grounds.
2. Transport/body-read status: corrected to `NETWORK/0`.
3. CSP `'self'`: corrected with configured application-host comparison.
4. Reload reset test: corrected with a dirty input state and clean-default assertion.
5. Save feedback: corrected with result-bearing messages and component fallback.
6. Forced loading exit: corrected and tested.

### Summary nitpicks

1. Duplicate logout UI removed; alert/live-region semantics corrected.
2. Reviewed auth tests use `vi.stubGlobal` and `vi.unstubAllGlobals`.
3. Logout retry is one bounded loop.
4. Production draft-patch casts are replaced by contract parsing.
5. Complete valid partner-preference merge coverage is present.
6. Reviewed draft fixtures use the shared schema-version constant.

## Local verification

- `npm ci`: passed; 201 packages installed, 206 audited, 0 vulnerabilities.
- `npm run check`: passed.
- Tests: **155 passed**:
  - contracts: 12;
  - Mini App: 103;
  - API: 39;
  - bot: 1.
- Typechecks and builds passed across all workspaces.
- `npm audit --audit-level=low`: passed with 0 vulnerabilities.
- `git diff --check`: clean.
- PostgreSQL integration passed remotely on `bb9881b`; it must rerun because the follow-up changes onboarding persistence-boundary behavior.

## Publication and remaining gates

1. Apply the follow-up mailbox to exact head `bb9881b` and push normally without history rewriting.
2. Require green exact-final-head Actions for typecheck/tests/build/audit/hygiene and PostgreSQL integration.
3. Reply to the six inline threads and post dispositions for the six summary nitpicks; resolve only after publication and verification.
4. Replace the stale PR description, including its 70-test count, old commit list, and obsolete Testing Library gap.
5. Request a substantive `@coderabbitai full review` on the published final head and complete an independent final-head review.
6. Deploy the exact final SHA to an approved HTTPS synthetic Telegram host.
7. Verify actual response-header CSP, same-origin `/api`, Telegram auth/restore/recovery, five writes, resume, conflict/reload, expiry/re-auth, and logout/post-logout behavior.
8. Complete the redacted synthetic operator evidence template, including keyboard, focus, screen-reader, responsive, zoom/text, safe-area, overflow, and reduced-motion checks.
9. Prove `ENABLE_REAL_SUBMISSIONS=false` and absence of forbidden data in network, storage, URLs, logs, analytics, and evidence.
10. Reconfirm ruleset `20794921` and keep PR #2 unmerged until every gate closes.

## Product constraints unchanged

- Adult Ethiopian Orthodox Tewahedo candidates only for the first release.
- Anonymous, values-only, photo-free discovery.
- No candidate social links.
- No chat before mutual decisions, administrator approval, and both final confirmations.
- Restricted in-app introduction before any future contact reveal.
- Verification photo remains private/admin-only with 30-day post-approval deletion.
- Pilot remains free; payment, wallet, credits, ratings, VIP, and paid verification remain unauthorized.
