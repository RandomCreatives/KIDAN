# Agent Handoff

Last updated: 2026-08-12

## Current state
- GitHub target: `https://github.com/RandomCreatives/KIDAN.git`; the remote MIT license is merged locally, but pushing requires authenticated GitHub credentials.
- Clean monorepo scaffold created; prior uploads and derived screenshot deleted.
- Working product name is **Kidan** and is intentionally replaceable.
- Mini App contains a functional seven-step onboarding and synthetic discovery prototype.
- Onboarding uses in-memory draft state, field-visibility labels, structured inputs, exact public preview, and separated consent choices; it sends and stores nothing.
- API contains health and Telegram init-data validation scaffolding.
- Bot contains generic-only `/start` and notification patterns.
- Shared contracts and an initial database migration are present.
- No real personal data, scraping, persistent auth, media, or messaging is implemented.

## Decisions
- First-release eligibility is limited to adult Ethiopian Orthodox Tewahedo Church candidates.
- Discovery is values-only and displays no candidate photo.
- The admin-only verification photo is scheduled for deletion 30 days after approval.
- A successful approval sequence opens a restricted in-app introduction, not name/phone/Telegram disclosure.
- Any later contact reveal needs a new mutual-consent ceremony.
- Neutral random public codes; old channel codes are never reused.
- Bot notifications contain no profile or contact data.
- Discovery and identity data are separate trust domains.
- Browser demo mode uses synthetic data only.

## Next tasks, in order
1. Convert the normalized questionnaire into versioned Zod contracts, field-visibility metadata, and an onboarding state machine; do not copy the Google Form's free-text structure.
2. Build onboarding with synthetic/local draft state and an exact public-profile preview. Do not collect real identities yet.
3. Add PostgreSQL persistence and opaque sessions, including verification-photo deletion scheduling.
4. Build the separate admin identity/profile review surface and threat model it before enabling real submissions.
5. Implement mutual decisions, admin connection review, and both final confirmations with integration tests.
6. Specify and build the restricted in-app introduction with retention, report, and block controls.
7. Keep payments out of the MVP; the 100 ETB accepted-connection concept remains an unimplemented backlog item.

## Verification
- 2026-08-12 — `npm run check` passed after onboarding: strict type checks, 12 tests, and production builds for contracts, Mini App, API, and bot.
- 2026-08-12 — `npm audit --audit-level=low` reported 0 vulnerabilities after pinning the patched esbuild release.
- 2026-08-12 — Vite preview responded successfully on port 5173.

## Change log
- 2026-08-12 — Initial scaffold by Arena agent. OpenCode project instructions, handoff command, and read-only security reviewer added.
- 2026-08-12 — Added working anonymous swipe prototype, detail sheet, connection-review journey, and profile/privacy surface.
- 2026-08-12 — Added shared domain contracts, Telegram init-data verification with tests, generic-only bot notifications, and initial privacy-oriented SQL schema.
- 2026-08-12 — Reviewed the existing Google Form and manual admin process. Added a normalized onboarding, data-classification, privacy, verification-media, and deferred-payment analysis in `docs/questionnaire-analysis.md`; source screenshots were deleted.
- 2026-08-12 — Product owner confirmed the upload is an admin-only verification photo and selected EOTC-only eligibility, values-only discovery, 30-day photo deletion, and restricted in-app introduction after all approval gates.
