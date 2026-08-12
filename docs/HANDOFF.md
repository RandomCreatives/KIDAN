# Agent Handoff

Last updated: 2026-08-12

## Current state
- Public repository target: `https://github.com/RandomCreatives/KIDAN`.
- Local `main` and `origin/main` both include the persistence-foundation milestone at `72101b1`; the reviewed commit is already published through a normal push, so no rebase or force-push is required.
- A staged phase roadmap exists in `00_ROADMAP_INDEX.txt` and `01`–`09` phase files (untracked planning docs). Phase 01 (publish + PostgreSQL validation) is the immediate next work; Workstream A (publish) is done.
- The Mini App remains a synthetic, values-first, photo-free prototype.
- The API has a persistence foundation: PostgreSQL Compose config, ordered checksum-tracked migrations, readiness checks, strict environment parsing, a PostgreSQL repository, opaque cookie sessions, CSRF/origin controls, resumable public drafts, separately encrypted private identity, consent receipts, and review-pending submission.
- Phase 01 work done so far: `migrate.ts` split into a reusable `applyMigrations(pool, directory?)` in `apps/api/src/database/migrations.ts`; a PostgreSQL integration suite in `apps/api/test/integration/` with a disposable-database harness, a public-code collision-retry repository test, ciphertext/hash-only identity storage, opaque session storage, session expiry/revocation/suspension/deletion, cross-user draft isolation through routes, optimistic versions, submitted-draft locking, transactional submission rollback, review-pending projection, consent receipts, encryption contexts, field separation, tri-state `wantsChildren`, migration checksums/no-op/anti-tamper, and `/ready` cases; unit vs. integration vitest configs; `npm run db:test` scripts; and a GitHub Actions CI workflow with a PostgreSQL 17 service.
- **Phase 01 is technically complete and verified in CI.** The integration suite ran RED at `81bbd21` (see `docs/reviews/COMMIT_81bbd21_REVIEW.txt`), a follow-up at `90614b4` fixed the defects, and CI is now GREEN: both the `check` and `integration` jobs passed, including the PostgreSQL 17 integration suite (run `31607920446`). Remaining non-code item: configure `main` branch protection so both jobs are required (recorded below as pending repository administration).
- Real identity and onboarding submission are disabled unless `ENABLE_REAL_SUBMISSIONS=true`; keep this false until admin review, hosting, legal, retention, and operational controls are approved.
- Verification-photo upload, admin UI/authentication, live discovery queries, restricted introduction messaging, consent-withdrawal endpoints, and deletion/export workflows remain unimplemented.

## Persistence and security decisions
- Telegram raw `initData` is validated server-side and exchanged for a random 32-byte opaque token in an HttpOnly, SameSite=Strict cookie (Secure in production).
- Only keyed HMAC-SHA-256 session/CSRF hashes are stored; sessions expire, can be revoked, and are denied for suspended/deleted users.
- Telegram mapping, name, phone, and date of birth use AES-256-GCM. Encryption contexts bind ciphertext to a field (and to the user where a user ID exists); keyed lookup hashes use a separate key.
- Public draft JSON rejects identity keys and uses optimistic version checks. Private identity and public drafts are separate repository operations and tables.
- Submission locks the draft, writes consent receipts with policy version/time, projects public/matching fields, and sets both profile and user to pending review. There is no user approval route.
- Review approval and identity approval are both required for discovery; blocks override discovery and introduction eligibility.
- Internal database UUIDs, Telegram IDs, names, phone numbers, dates of birth, matching preferences, and contacts do not appear in auth/discovery responses.
- PostgreSQL remains loopback-only in local Compose. Production database location is undecided pending Ethiopian data-residency/legal review.

## Locked product decisions
- First-release eligibility: adult Ethiopian Orthodox Tewahedo Church candidates only.
- Discovery: values-only with no candidate photo.
- Verification photo: administrator-only evidence, delete 30 days after approval except an exceptional documented hold.
- Connection: mutual interest + administrator approval + both final confirmations opens only a restricted in-app introduction; it does not reveal name, phone, Telegram username, or a direct-message link.
- Launch is free. A possible 100 ETB accepted-match charge remains backlog-only.

## Verification
- 2026-08-12 — Latest fully verified committed baseline `72101b1`: strict source/test type checks, 37 tests (11 contracts, 25 API, 1 bot), all production builds, and 0 audit vulnerabilities.
- 2026-08-12 — After refactoring `migrate.ts` and adding the integration suite, `npm run check` still passes: strict type checks (including the new integration tests), 37 unit tests, all production builds.
- 2026-08-12 — `npm audit --audit-level=low` reported 0 vulnerabilities and `git diff --check` passed.
- 2026-08-12 — `81bbd21` was pushed and CI ran RED: the PostgreSQL integration job (`npm run db:test`) failed. This was a real defect in the repository and tests, not an environment fluke. The blocking defects were a malformed `touchSession` SQL statement (invalid interval arithmetic, would fail at runtime on every session touch) and several integration-test correctness/flakiness issues (invalid public codes from a hex alphabet, a reused phone fixture violating the unique lookup-hash, a Telegram-ID storage assertion that checked the wrong ID, an expiry assertion masked by an earlier revocation, and a missing deleted-user test). See `docs/reviews/COMMIT_81bbd21_REVIEW.txt` and the Change log below for the fixes.
- 2026-08-12 — The fix commit `90614b4` was verified in CI (run `31607920446`): both the `check` job (typecheck, 37 unit tests, build, `npm audit`, `git diff --check`) and the `integration` job (PostgreSQL 17 disposable-database harness, 21 integration tests) passed. The integration defects from `81bbd21` are resolved; see `docs/reviews/COMMIT_90614b4_REVIEW.txt`.

### Branch protection (pending repository administration)
`main` branch protection / rulesets must require both CI jobs before merge and block force pushes / direct bypasses:
- `check` — Typecheck, unit tests, build, audit.
- `integration` — PostgreSQL integration tests.
Configure via repository Settings → Branches/Rulesets (or `gh api` if permitted). This is a repository setting, not a code change; until applied, Phase 01 is technically complete in code but its required-status enforcement is outstanding.

### Integration suite facts (durable)
- Public codes come from the alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (Kidan excludes `0`/`1` and `O`/`I` to avoid ambiguity); the generator is `generatePublicCode()` in `apps/api/src/security/publicCode.ts`.
- Collision handling: `findOrCreateUserByTelegram` retries `createPublicCode()` once on a unique-violation and rolls back the user row so no orphan `app_user` is left behind. Integration tests exercise this by forcing the first generated code to collide.
- Harness: `createIntegrationHarness()` creates a disposable `kidan_it_*` database, applies all migrations from zero, runs the suite, and drops the database in `cleanup()`. It now also drops the database if migrations fail, so a broken migration run leaves no orphans.
- The integration suite is intentionally excluded from the default unit `npm test`; run it with `npm run db:test` (requires `TEST_DATABASE_URL` or `DATABASE_URL`). CI runs it in a separate job against a PostgreSQL 17 service.

## Next tasks, in order
1. ~~Re-verify the fix commit against PostgreSQL~~ — Done: CI run `31607920446` (commit `90614b4`) passed both jobs, including the PostgreSQL 17 integration suite (21 tests). Recorded in HANDOFF and `docs/reviews/COMMIT_90614b4_REVIEW.txt`.
2. *Pending repository administration:* configure `main` branch protection/rulesets to require the `check` and `integration` jobs and block force pushes (see the Branch protection note above).
3. Threat-model and build separate administrator authentication/review before enabling real submissions; users must never self-approve.
3. Add consent withdrawal, profile pause/correction/export/deletion, audit events, and approved retention jobs.
4. Implement discovery/mutual-decision queries with review and bidirectional-block predicates, then the restricted in-app introduction.
5. Add private verification-photo storage only after its upload authorization, re-encoding, malware scanning, 30-day deletion, backup expiry, and exceptional-hold controls are approved.

## Change log
- 2026-08-12 — Initial scaffold, OpenCode instructions, specialist agent, synthetic discovery, Telegram validation, generic-only bot, and privacy-oriented schema.
- 2026-08-12 — Analyzed the prior questionnaire; deleted source uploads; locked EOTC-only eligibility, free initial launch, values-only discovery, admin-only verification media, and restricted introductions.
- 2026-08-12 — Added seven-step local-only onboarding and canonicalized marriage intention as `teklil`, `kidusan_kurban`, or `orthodox_church_marriage`.
- 2026-08-12 — Added the persistence foundation and published it to origin/main at `72101b1`.
- 2026-08-12 — Drafted Phase 01 PostgreSQL validation: extracted `applyMigrations(pool)` reusable runner, added a disposable-database integration harness, repository/migration/`/ready` integration tests, unit/integration vitest split, `npm run db:test`, and a CI workflow with a PostgreSQL 17 service. Integration execution is pending an environment with PostgreSQL.
- 2026-08-12 — Pushed `81bbd21` (Phase 01 draft) and CI ran RED on `npm run db:test`. Review `docs/reviews/COMMIT_81bbd21_REVIEW.txt` listed four blockers and seven major findings: a malformed `touchSession` SQL statement, invalid public codes from a hex alphabet in the collision test, a reused phone fixture violating the unique lookup hash, an ineffective Telegram-ID storage assertion, an expiry assertion masked by an earlier revocation, a missing deleted-user test, harness not dropping the database on migration failure, and an unhardened CI workflow.
- 2026-08-12 — Fix commit `90614b4` (verified green; see `docs/reviews/COMMIT_90614b4_REVIEW.txt`): corrected `touchSession` SQL with an explicit `::timestamptz` cast and grouped arithmetic; switched the public-code collision test to codes from `generatePublicCode()`; gave every `savePrivateIdentity` call a unique E.164 phone via `uniquePhone()`; rewrote the Telegram-ID storage test to assert against the actual stored Telegram ID; split the session expiry test from the revocation test and added a deleted-user test; made the harness drop the disposable database when migrations fail; and hardened the CI workflow (top-level `permissions: contents: read`, pinned action SHAs, `concurrency` cancel, job `timeout-minutes`, and a separate `integration` job). CI run `31607920446` passed both jobs (37 unit tests + 21 PostgreSQL integration tests).
- 2026-08-12 — Documentation/CI cleanup (follow-up to the `90614b4` review): upgraded pinned `actions/checkout`/`actions/setup-node` to reviewed v6 SHA pins; moved the two review documents into `docs/reviews/` and fixed the in-repo reference; recorded required `main` branch protection in HANDOFF as pending repository administration; and marked Phase 01 technically complete and verified in CI. No product changes.
