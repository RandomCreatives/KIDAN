# Phase 02 operator evidence

**Status: MERGED.** Phase 02 was merged into `main` on 2026-09-06 (PR #2;
`main` head `75dae1e`; reviewed application code `2cda55e`, with two docs-only
evidence commits `7afd83f`/`75dae1e` on top). All CI checks — PostgreSQL
integration tests, typecheck/unit/build/audit, CodeRabbit, and both Vercel
deployments — were green on the merged commit.

## What is in this directory

- `OPERATOR_RECORD_PHASE02_DRAFT.md` — the operator record. Items confirmed by
  the live build/agent are marked `[MACHINE-VERIFIED]`; items evidenced by the
  human walkthrough are marked `[OPERATOR-CONFIRMED]`; a small set of deeper
  DevTools/accessibility confirmations remain `[OPERATOR REQUIRED]` and are
  tracked as non-blocking Phase 03 follow-ups.
- `MERGE_REVIEW_2cda55e.md` — the exact-head substantive code review (APPROVE).
- `OPERATOR_RECORD_TEMPLATE.md` — the original blank template (kept for
  reference).
- `screenshots/01..06-*.jpg` — six redacted Android Telegram Mini App captures
  of the authenticated onboarding lifecycle, with SHA-256 hashes recorded in
  the operator record.

## What the evidence establishes

Real Telegram (Android) Mini App authentication succeeds against the staging
deployment and drives the full anonymous onboarding flow: eligibility gate →
values-only context checkpoints → the public discovery draft preview, which by
design shows **no name and no photo**. Real submissions, identity verification,
admin approval, discovery, matching, messaging, contact reveal, and payments
are disabled in this pilot preview (`ENABLE_REAL_SUBMISSIONS=false`), as shown
on every screen. Response headers/CSP, same-origin `/api`, and the network
inventory (same-origin + the reviewed `telegram.org` SDK only) are recorded and
machine-verified.

## Carried to Phase 03 (non-blocking)

The deeper client confirmations that are impractical to capture on a phone —
cookie flags, `sessionStorage`=CSRF-only / empty `localStorage`, save-draft →
refresh resume, second-client version conflict / "Reload latest", logout → 401,
wider-viewport/200%-zoom/reduced-motion, and one TalkBack/keyboard pass — are
listed in the operator record's "Remaining open items" section and scheduled
for Phase 03. Also queued: drop `tokenProbe`/`configuredBotId` from the
production 401 body, and rename the bot display name away from "testbot" via
BotFather.

Use synthetic values only. Never record raw Telegram `initData`, bot tokens,
cookies, session tokens, CSRF values, Telegram identifiers/usernames/names,
public codes, phone numbers, or other personal data. Redact screenshots,
network exports, console output, and response headers before publication.
