# Phase 2 status — authentication and real onboarding

Status: **corrections locally verified; publication and exact-head review gates remain open**

Updated: 2026-08-18 (Africa/Nairobi)

## Published state

- PR: #2 (open, unmerged)
- Published head: `a69640931b550af496fe622018d02ca03dd5c4b2`
- Published tree: `63e3c0f20276dcffa531cef0b0d38a873d7369be`
- Exact-head Actions: run `32038437039` passed on the published head
- Exact-head automated review: CodeRabbit review `4959449779` completed with six actionable inline findings plus one persistence-test nitpick
- Active ruleset: `20794921`, requiring strict exact-head Actions and resolved review conversations

A passing review status means the automated review completed; it is not an approval and does not close actionable findings.

## New local correction

Local commit `066d301` (`fix: address exact-head review findings`) is based directly on published head `a696409` and addresses:

1. recoverable handling for generic HTTP 5xx authentication failures;
2. Telegram Web-compatible `frame-ancestors` CSP in source and Nginx;
3. submitted-draft hydration into the onboarding completion state;
4. polite loading/error live announcements;
5. preservation of unsaved public edits during implicit CSRF/session recovery;
6. direct and post-merge partner-age-bound validation;
7. a repository-level assertion that out-of-scope identity fields are not persisted.

The correction is not yet published.

## Local validation

- `npm ci`: passed
- `npm run check`: passed
- Tests: 159/159 passed
  - contracts: 13
  - Mini App: 105
  - API: 40
  - bot: 1
- TypeScript checks: passed for all workspaces
- Production builds: passed for all workspaces
- `npm audit --audit-level=low`: passed, 0 vulnerabilities
- focused correction regressions: passed
- `git diff --check`: passed

## Operational gates still open

- publish the round-trip-verified correction mailbox;
- confirm new remote head/tree;
- obtain passing strict exact-head Actions on that new head;
- request and complete another substantive exact-head review;
- post dispositions and resolve every review conversation;
- replace the incorrect PR body;
- complete authorized external HTTPS/Telegram/Nginx/CSP/privacy/accessibility evidence.

No approved public HTTPS host, Telegram operator, screen-reader operator, Nginx runtime, Docker, Podman, or local PostgreSQL service is available in this workspace. External evidence must remain marked unverified rather than inferred or fabricated.

## Merge decision

**DO NOT MERGE.** Local corrections are complete and verified, but the new head has not been published, CI/reviewed at exact head, administratively closed, or externally evidenced.
