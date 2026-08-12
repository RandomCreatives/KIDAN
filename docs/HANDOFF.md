# Agent Handoff

Last updated: 2026-08-12

## Current state
- GitHub target: `https://github.com/RandomCreatives/KIDAN.git`; this Arena session is working on branch `arena/019ff3e3-kidan`.
- Clean monorepo scaffold created; prior uploads and derived screenshot deleted.
- Working product name is **Kidan** and is intentionally replaceable.
- Mini App contains a functional seven-step onboarding and synthetic discovery prototype.
- Onboarding uses in-memory draft state, field-visibility labels, structured inputs, exact public preview, and separated consent choices; it sends and stores nothing.
- API contains health, Telegram init-data validation, and an optional PostgreSQL-backed opaque-session foundation.
- The Telegram auth route still supports validation-only mode when no session store is configured; when persistence is configured it returns only an opaque session token and a non-identity principal.
- PostgreSQL persistence includes an `app_session` migration, keyed session-token hashes, encrypted Telegram ID storage, and keyed Telegram lookup hashes in the identity vault.
- Bot contains generic-only `/start` and notification patterns.
- Shared contracts and privacy-oriented database migrations are present.
- No real personal data, scraping, media, admin review UI, or messaging is implemented.

## Decisions
- First-release eligibility is limited to adult Ethiopian Orthodox Tewahedo Church candidates.
- Discovery is values-only and displays no candidate photo.
- The canonical storage value for the Kidusan Kurban marriage intention is `kidusan_kurban`; the ambiguous `kurban` slug is rejected.
- The admin-only verification photo is scheduled for deletion 30 days after approval.
- A successful approval sequence opens a restricted in-app introduction, not name/phone/Telegram disclosure.
- Any later contact reveal needs a new mutual-consent ceremony.
- Neutral random public codes; old channel codes are never reused.
- Bot notifications contain no profile or contact data.
- Discovery and identity data are separate trust domains.
- Browser demo mode uses synthetic data only.

## Next tasks, in order
1. Verify the PostgreSQL migration and session store against a real PostgreSQL instance; Docker/PostgreSQL were not available in this environment.
2. Build the separate admin identity/profile review surface and threat model it before enabling real submissions.
3. Implement mutual decisions, admin connection review, and both final confirmations with integration tests.
4. Specify and build the restricted in-app introduction with retention, report, and block controls.
5. Add encrypted identity/profile draft persistence only after retention, key-management, and admin-access policies are approved.
6. Keep payments out of the MVP; the 100 ETB accepted-connection concept remains an unimplemented backlog item.

## Verification
- 2026-08-12 — `npm run check` passed after onboarding: strict type checks, 12 tests, and production builds for contracts, Mini App, API, and bot.
- 2026-08-12 — `npm audit --audit-level=low` reported 0 vulnerabilities after pinning the patched esbuild release.
- 2026-08-12 — Vite preview responded successfully on port 5173.
- 2026-08-12 — Confirmed `origin/main` HEAD is `231cb36e72bf3c09541be418092c47bb9b1922a8` before persistence work.
- 2026-08-12 — `npm install` completed with 0 vulnerabilities after adding PostgreSQL client dependencies.
- 2026-08-12 — `npm run check` passed: contracts, Mini App, API, and bot type checks; 15 tests; production builds.
- 2026-08-12 — `npm audit --audit-level=low` reported 0 vulnerabilities.
- 2026-08-12 — Privacy inspection found no raw session-token persistence, no Telegram IDs in auth responses, no bot/profile/contact notification leaks, and only synthetic identity literals in tests/demo onboarding. PostgreSQL integration remains unverified because this environment does not provide Docker/PostgreSQL.

## Change log
- 2026-08-12 — Initial scaffold by Arena agent. OpenCode project instructions, handoff command, and read-only security reviewer added.
- 2026-08-12 — Added working anonymous swipe prototype, detail sheet, connection-review journey, and profile/privacy surface.
- 2026-08-12 — Added shared domain contracts, Telegram init-data verification with tests, generic-only bot notifications, and initial privacy-oriented SQL schema.
- 2026-08-12 — Reviewed the existing Google Form and manual admin process. Added a normalized onboarding, data-classification, privacy, verification-media, and deferred-payment analysis in `docs/questionnaire-analysis.md`; source screenshots were deleted.
- 2026-08-12 — Product owner confirmed the upload is an admin-only verification photo and selected EOTC-only eligibility, values-only discovery, 30-day photo deletion, and restricted in-app introduction after all approval gates.
- 2026-08-12 — Corrected marriage-intention contracts to use `kidusan_kurban` canonically across discovery/onboarding and reject the legacy `kurban` slug.
- 2026-08-12 — Added PostgreSQL session-persistence foundation with opaque session tokens, HMAC token storage, encrypted Telegram ID vault storage, keyed lookup hashes, API wiring, tests, and environment documentation.
