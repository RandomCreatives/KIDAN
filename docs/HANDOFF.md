# Agent Handoff

Last updated: 2026-08-12

## Current state
- Public repository target: `https://github.com/RandomCreatives/KIDAN`.
- Local `main` and `origin/main` both include the persistence-foundation milestone at `72101b1`; the reviewed commit is already published through a normal push, so no rebase or force-push is required.
- A staged phase roadmap exists in `00_ROADMAP_INDEX.txt` and `01`–`09` phase files (untracked planning docs). Phase 01 (publish + PostgreSQL validation) is the immediate next work; Workstream A (publish) is done.
- The Mini App remains a synthetic, values-first, photo-free prototype.
- The API has a persistence foundation: PostgreSQL Compose config, ordered checksum-tracked migrations, readiness checks, strict environment parsing, a PostgreSQL repository, opaque cookie sessions, CSRF/origin controls, resumable public drafts, separately encrypted private identity, consent receipts, and review-pending submission.
- Phase 01 work done so far in this session: `migrate.ts` split into a reusable `applyMigrations(pool, directory?)` in `apps/api/src/database/migrations.ts`; a PostgreSQL integration suite drafted in `apps/api/test/integration/` with a disposable-database harness plus repository, migration-checksum, and `/ready` cases; unit vs. integration vitest configs; `npm run db:test` scripts; and a GitHub Actions CI workflow with a PostgreSQL 17 service.
- The drafted integration suite is type-checked and the existing unit/baseline (`npm run check`) still passes, but the integration tests have NOT been executed because this environment has no Docker/PostgreSQL. They must be run via `npm run db:test` (or CI) where PostgreSQL is available.
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
- Tests cover stale/tampered Telegram data, secure cookie/CSRF behavior, session expiry/revocation, cross-user draft isolation, optimistic conflict/submission locking, review/block gates, encryption tamper/context checks, and projection exclusions.
- New drafted PostgreSQL integration suite covers concurrent first-login, public-code collision retry, ciphertext/hash-only identity storage, opaque session storage, session expiry/revocation/suspension, cross-user draft isolation through routes, optimistic versions, submitted-draft locking, transactional submission rollback, review-pending projection, consent receipts, encryption contexts, field separation, tri-state `wantsChildren`, migration checksums/no-op/anti-tamper, and `/ready` against a live database.
- The integration suite is intentionally excluded from the default unit `npm test`; run it with `npm run db:test` (requires `TEST_DATABASE_URL` or `DATABASE_URL`).
- Real PostgreSQL migration and repository execution remain explicitly unverified in this environment; they are verified in CI on every push.

## Next tasks, in order
1. In an environment with Docker/PostgreSQL, run `npm run db:up`, `npm run db:migrate`, exercise `/ready`, then `npm run db:test` to execute the drafted integration suite against real PostgreSQL (including concurrency and rollback). Fix any failures and record results here.
2. Threat-model and build separate administrator authentication/review before enabling real submissions; users must never self-approve.
3. Add consent withdrawal, profile pause/correction/export/deletion, audit events, and approved retention jobs.
4. Implement discovery/mutual-decision queries with review and bidirectional-block predicates, then the restricted in-app introduction.
5. Add private verification-photo storage only after its upload authorization, re-encoding, malware scanning, 30-day deletion, backup expiry, and exceptional-hold controls are approved.

## Change log
- 2026-08-12 — Initial scaffold, OpenCode instructions, specialist agent, synthetic discovery, Telegram validation, generic-only bot, and privacy-oriented schema.
- 2026-08-12 — Analyzed the prior questionnaire; deleted source uploads; locked EOTC-only eligibility, free initial launch, values-only discovery, admin-only verification media, and restricted introductions.
- 2026-08-12 — Added seven-step local-only onboarding and canonicalized marriage intention as `teklil`, `kidusan_kurban`, or `orthodox_church_marriage`.
- 2026-08-12 — Added the persistence foundation and published it to origin/main at `72101b1`.
- 2026-08-12 — Drafted Phase 01 PostgreSQL validation: extracted `applyMigrations(pool)` reusable runner, added a disposable-database integration harness, repository/migration/`/ready` integration tests, unit/integration vitest split, `npm run db:test`, and a CI workflow with a PostgreSQL 17 service. Integration execution is pending an environment with PostgreSQL.
