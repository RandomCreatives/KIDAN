# Phase 02 synthetic operator record — TEMPLATE (NOT COMPLETED EVIDENCE)

## Build and environment

- Final 40-character commit SHA:
- Approved HTTPS test URL (redact hostname if required; retain durable internal link):
- Deployment/build ID:
- `ENABLE_REAL_SUBMISSIONS=false` proof (no secret values):
- UTC and operator-local date/time/time zone:
- Operator:
- Telegram client/platform/version:
- Browser engine/version:
- Screen reader/version:
- Evidence artifact links and SHA-256 hashes:

## Redaction confirmation

Confirm every item below is absent from this record and all linked artifacts:

- [ ] raw Telegram `initData` or hash/signature
- [ ] bot token
- [ ] cookie/session token
- [ ] CSRF value
- [ ] Telegram ID, name, or username
- [ ] phone/name/date of birth/photo or other personal data
- [ ] internal public code or request secret

Synthetic test-data description (must not identify a real person):

## Deployed response and source inventory

- [ ] HTTPS root returns the reviewed `Content-Security-Policy` response header
- [ ] exact redacted header output attached/linked
- [ ] `frame-ancestors` behavior works in approved Telegram mobile and Telegram Web clients
- [ ] `/api` is same-origin and no browser request targets localhost
- [ ] network inventory contains only same-origin resources/API and the reviewed `https://telegram.org` SDK origin
- [ ] no third-party fonts, analytics, trackers, pixels, ads, or session-replay endpoints

Observed exact CSP:

## Synthetic Telegram lifecycle

Record expected/actual result and evidence reference for each item:

- [ ] first authentication; API response exposes no Telegram/internal user ID
- [ ] opaque HttpOnly/Secure/SameSite=Strict cookie observed without recording its value
- [ ] refresh restores the cookie-backed session and current CSRF into sessionStorage only
- [ ] fresh public draft creation
- [ ] five ordered public-only checkpoints through final preview
- [ ] refresh resumes the saved payload, version, and current step
- [ ] second client creates a version conflict; first client cannot overwrite silently
- [ ] Reload latest applies payload/version/visible step coherently
- [ ] expired/revoked session produces the recovery UI and re-authenticates deliberately
- [ ] logout waits for server confirmation and announces busy/success/failure truthfully
- [ ] post-logout `GET /v1/session` returns 401
- [ ] no auth request or accepted cookie appears after confirmed logout
- [ ] stale-CSRF/ambiguous-network logout remains retryable and never falsely says “Signed out”

## Privacy/storage inspection

- [ ] public-draft request/response contains no private identity, consent, verification-photo, Telegram, contact, cookie, or CSRF data
- [ ] localStorage contains no onboarding/auth data
- [ ] sessionStorage contains only the expected CSRF item and no private/profile data
- [ ] URL/history/referrer contain no onboarding/auth values
- [ ] console, application logs, proxy logs, analytics, and evidence contain no forbidden values
- [ ] real identity, verification, submission, admin approval, discovery, matching, messaging, contact reveal, and payments remain disabled

## Responsive and motion

For each viewport, record dimensions, orientation, zoom/text scale, expected/actual, and evidence reference:

- [ ] narrow Telegram-sized viewport
- [ ] wider viewport
- [ ] safe-area top/bottom/left/right behavior
- [ ] no horizontal overflow at supported widths
- [ ] 200% zoom/text scaling remains operable and readable
- [ ] reduced-motion preference removes nonessential motion

## Keyboard and screen reader

- [ ] logical keyboard-only order through auth and all five real onboarding steps
- [ ] every action is keyboard-operable
- [ ] visible focus is never obscured
- [ ] validation/error focus or announcement identifies the problem
- [ ] disabled and `aria-busy` states are announced during save/reload/logout
- [ ] labels/names are meaningful without visual context
- [ ] live announcements verified for auth, saving, save failure, conflict, reload, logout busy/failure, and signed-out success
- [ ] no focus moves into disabled content or disappears after a step transition

## Defects and disposition

List every observed defect, severity, follow-up issue/commit, and retest result. Do not mark this record complete with an unresolved blocker or major.

## Final operator declaration

- [ ] All checks above were performed on the exact final SHA and approved HTTPS deployment.
- [ ] Evidence is synthetic and redacted.
- [ ] `ENABLE_REAL_SUBMISSIONS=false` was confirmed on that deployment.
- [ ] No blocker or major remains.

Operator name/date:
Independent verifier name/date:
