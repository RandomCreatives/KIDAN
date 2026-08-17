# Agent Handoff

Last updated: 2026-08-17 (Africa/Nairobi)

## Current status

- Repository: `https://github.com/RandomCreatives/KIDAN`.
- Phase 01 baseline and PR #2 base: `053fb6ecf9cbff72b2e2d052588d5250ffd7d773`.
- PR #2 (`phase2/miniapp-api-integration`) is open and unmerged.
- Last independently observed remote head: `28ac6ac1e2f1f48f4d7de5608ce2c4cb67b6f236`; tree `8e8a921f4bc6bd1825977ffd2e59783e79aafa7e`.
- Exact-head Actions run `32022518353` passed typecheck, unit tests, builds, audit, merge-base whitespace hygiene, and PostgreSQL integration.
- The latest completed CodeRabbit review remains review `4949831122` against `e2d3e22`. CodeRabbit skipped automatic review of `28ac6ac` because this repository requires a manual request.
- Decision remains **REQUEST CHANGES / DO NOT MERGE** until the local corrections below are published, exact-final-head checks and review pass, conversations are resolved, and deployment/operator evidence is complete.
- `ENABLE_REAL_SUBMISSIONS` remains `false` and must remain false in local, CI, staging, and operator-test environments.

## Correction commits based exactly on publication base `28ac6ac`

The publication mailbox carries normal commits with these subjects. Their applied commit IDs may differ because `git am` records the publisher’s committer identity and time; verify the resulting tree rather than copying local commit IDs. Publication is not approval, merge authorization, or evidence of resolved review conversations.

1. `fix(miniapp): prove timeout and recovery behavior`
   - maps timeout aborts to `ApiError("NETWORK", 0)`;
   - uses deterministic fake-timer tests that prove the configured timer calls `AbortController.abort()` during stalled fetch and stalled response-body reading;
   - proves `INVALID_CSRF` authentication recovery and second hydration cannot move the active onboarding step backward;
   - preserves the recoverable `Connection error` + `Retry` path for `NETWORK` failures;
   - provides stable focus for action and no-action auth gate states without callback-ref focus stealing.

2. `refactor(phase2): resolve review maintainability findings`
   - lazily creates the API client in `AuthProvider`;
   - types auth error mapping with `ClientErrorCode`;
   - removes the unused `errorBody` helper;
   - centralizes onboarding schema-version and initial-step defaults in `@kidan/contracts`;
   - deduplicates validated payload application;
   - proves hydrated payload reaches form state and reload discards omitted local edits;
   - covers the saved pilot-disabled screen;
   - makes auth status labels exhaustive;
   - deduplicates auth-route test setup.

CodeRabbit’s old component save-timer nitpick is superseded because the unsafe component-level `Promise.race` was removed; the API client owns the aborting timeout.

## Review `4949831122` disposition

### Accepted and corrected

- CI whitespace checks compare merge-base to head.
- The cumulative static CSP meta policy was removed; environment-specific response headers are authoritative.
- One request-layer controller and timer cover `fetch()` and `response.text()`.
- Auth gate focus no longer uses a recreated callback ref.
- The faith fixture’s explicit value wins over the spread.
- The deferred failed-save test waits for a settled error and re-enabled controls.
- `resumedStep` applies only on initial hydration; explicit reload/retry handlers apply their own returned step.
- Demo progression proves each exact step transition.

### Rejected with rationale

Do **not** apply CodeRabbit’s literal `NETWORK → unavailable` recommendation without redesigning the state model. In the current UI:

- `fatal` renders a recoverable **Connection error** with **Retry**;
- `unavailable` renders **Account unavailable** with no recovery action.

Mapping temporary transport failure to `unavailable` would mislabel the condition and trap the user. The local tests pin `mapErrorToStatus("NETWORK", 0) === "fatal"`, focused Retry availability, and successful recovery. Post this rationale in the review thread before resolving it.

### `401` logout warning

The walkthrough warning is not reproducible against the current implementation:

- final session GET `401 UNAUTHENTICATED` becomes successful `already-absent` sign-out without a logout POST;
- logout POST `401 UNAUTHENTICATED` becomes successful concurrent `already-absent` sign-out;
- both paths end in `unauthenticated` and have component tests;
- malformed or unvalidated responses do not falsely claim sign-out.

Document this disposition rather than changing the working path.

## Local verification after the two follow-up commits

- `npm ci`: passed; 201 packages installed, 206 audited, 0 vulnerabilities.
- `npm run typecheck`: passed across contracts, Mini App, API, and bot.
- `npm test`: **152 tests passed**:
  - Mini App: 102;
  - API: 37;
  - contracts: 12;
  - bot: 1.
- `npm run build`: passed across all workspaces.
- `npm audit --audit-level=low`: passed with 0 vulnerabilities.
- `git diff --check`: clean.
- PostgreSQL cannot run in this sandbox. Remote integration passed at `28ac6ac`; it must run again after these local commits are published.

## Implemented security and privacy boundary

- Telegram authentication uses validated raw `initData`; `initDataUnsafe` is not trusted.
- The browser receives an opaque HttpOnly session cookie and a CSRF token.
- Auth/session operations are ordered; logout uses the final cookie-backed session and only claims revocation after 204 or validated already-absent 401.
- Public draft saves are serialized, versioned, validated, and limited to public onboarding sections.
- Private identity, phone, date of birth, verification photo, consent, Telegram identifiers, session token, and CSRF do not enter public-draft payloads.
- Demo mode is synthetic, local-only, and network-free.
- Real identity upload, submission, review, discovery, matching, messaging, contact reveal, and payment remain disabled/out of scope.
- The production CSP must come from response headers. `apps/miniapp/index.html` intentionally has no static CSP meta policy.

## Publication procedure

1. Apply the generated mailbox `.txt` to the exact remote head `28ac6ac` using `git am`.
2. Confirm the resulting commit IDs and tree match the local commits.
3. Push normally to `phase2/miniapp-api-integration`; do not amend, rebase, squash, force-push, or merge.
4. Require both exact-final-head Actions checks to pass.
5. Reply to the `NETWORK → unavailable` thread with the rationale above and disposition the `401` warning.
6. Request a new CodeRabbit full review only after the fixes are published and rolling review allowance is available.
7. Independently review the exact final head and confirm conversation resolution.

## Hard gates still open

1. Publish the two normal local commits.
2. Obtain green exact-final-head typecheck/test/build/audit/hygiene and PostgreSQL integration.
3. Obtain fresh exact-final-head CodeRabbit and independent review.
4. Resolve all required review conversations only after source and tests support the disposition.
5. Deploy the exact final SHA to an approved HTTPS synthetic Telegram test host using same-origin `/api` and production response-header CSP.
6. Complete `docs/evidence/phase-02/OPERATOR_RECORD_TEMPLATE.md` with synthetic, redacted evidence.
7. Verify auth, restore, five writes, resume, conflict/reload, expiry/re-auth, logout, post-logout 401, and no accepted cookie after logout.
8. Verify narrow/wide layouts, safe areas, overflow, 200% text/zoom, reduced motion, keyboard/focus, and a real screen reader.
9. Prove `ENABLE_REAL_SUBMISSIONS=false` and absence of forbidden data in network, storage, URLs, logs, analytics, and evidence.
10. Reconfirm active ruleset `20794921` and update the PR description truthfully.
11. Approve or merge only as a separate decision after every gate closes.

## Locked product scope

- First-release eligibility is limited to adult Ethiopian Orthodox Tewahedo Church candidates.
- Discovery is anonymous, values-only, and photo-free.
- No social-media links belong in candidate profiles.
- Name, phone, Telegram username, and direct-message links remain hidden.
- A future verification photo is private/admin-only and deleted 30 days after approval.
- Mutual interest, administrator approval, and both users’ final confirmations may later open only a restricted in-app introduction.
- The controlled pilot remains free. Payment, credits, wallet, ratings, VIP, and paid verification are not authorized.
