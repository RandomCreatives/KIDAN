# Agent Handoff

Last updated: 2026-08-12

## Current state
- Public repository target: `https://github.com/RandomCreatives/KIDAN`.
- Local `main` includes the verified onboarding/contract baseline at `0b18b6e`; remote history still needs the owner to publish that commit and the persistence milestone without force-pushing.
- The Mini App remains a synthetic, values-first, photo-free prototype.
- The API now has a persistence foundation: PostgreSQL Compose config, ordered checksum-tracked migrations, readiness checks, strict environment parsing, a PostgreSQL repository, opaque cookie sessions, CSRF/origin controls, resumable public drafts, separately encrypted private identity, consent receipts, and review-pending submission.
- Discovery projections use neutral public codes rather than internal UUIDs and explicitly allowlist output fields.
- Real identity and onboarding submission are disabled unless `ENABLE_REAL_SUBMISSIONS=true`; keep this false until admin review, hosting, legal, retention, and operational controls are approved.
- Verification-photo upload, admin UI/authentication, live discovery queries, restricted introduction messaging, consent-withdrawal endpoints, and deletion/export workflows remain unimplemented.
- Arena has no Docker, Docker Compose, or `psql`; all TypeScript and in-memory/HTTP tests can run here, but real PostgreSQL migration/repository behavior is not yet integration-tested.

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
- 2026-08-12 — Latest fully verified committed baseline `0b18b6e`: strict source/test type checks, 16 tests, all production builds, and 0 audit vulnerabilities.
- 2026-08-12 — Persistence foundation full `npm run check` passed: strict source/test type checking, 37 tests (11 contracts, 25 API, 1 bot), and all production builds.
- 2026-08-12 — `npm audit --audit-level=low` reported 0 vulnerabilities and `git diff --check` passed.
- Tests cover stale/tampered Telegram data, secure cookie/CSRF behavior, session expiry/revocation, cross-user draft isolation, optimistic conflict/submission locking, review/block gates, encryption tamper/context checks, and projection exclusions.
- The staged diff passed a privacy review: no committed secrets, raw identity logging, database-row serialization, or internal user IDs in auth/discovery responses were found.
- Real PostgreSQL migration and repository integration remain explicitly unverified in Arena.

## Next tasks, in order
1. In an environment with Docker/PostgreSQL, run `npm run db:up`, `npm run db:migrate`, exercise `/ready`, and add real repository integration tests (including concurrency and rollback).
2. Threat-model and build separate administrator authentication/review before enabling real submissions; users must never self-approve.
3. Add consent withdrawal, profile pause/correction/export/deletion, audit events, and approved retention jobs.
4. Implement discovery/mutual-decision queries with review and bidirectional-block predicates, then the restricted in-app introduction.
5. Add private verification-photo storage only after its upload authorization, re-encoding, malware scanning, 30-day deletion, backup expiry, and exceptional-hold controls are approved.

## Change log
- 2026-08-12 — Initial scaffold, OpenCode instructions, specialist agent, synthetic discovery, Telegram validation, generic-only bot, and privacy-oriented schema.
- 2026-08-12 — Analyzed the prior questionnaire; deleted source uploads; locked EOTC-only eligibility, free initial launch, values-only discovery, admin-only verification media, and restricted introductions.
- 2026-08-12 — Added seven-step local-only onboarding and canonicalized marriage intention as `teklil`, `kidusan_kurban`, or `orthodox_church_marriage`.
- 2026-08-12 — Added the persistence foundation described above; live PostgreSQL verification remains pending outside Arena.
