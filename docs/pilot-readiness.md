# Kidan — First Real-User Test: Readiness & Recommendations

*Prepared 2026-09-13 after a full system audit (413 unit tests, 50 DB integration tests, typecheck, production build, and an instrumented browser walkthrough of every user-facing path). All green.*

## 1. Where the system stands today

| Area | Status |
|---|---|
| Candidate Mini App (onboarding → discover → requests → connections → profile) | ✅ Works end-to-end; audited in a real browser with zero console errors |
| Operator Admin Console (queue, submission detail, connections, funnel, feedback) | ✅ Works; password auth + CSRF verified |
| API (auth, discovery, connections, feedback, legal pages, 404 shell, robots) | ✅ Verified; unauthenticated probes correctly 401 |
| Language | 🔒 English everywhere. Amharic catalog (451 keys) is complete but **dark-launched**: tapping አማርኛ shows a "coming soon" notice; `?lang=am`, saved preference, and Telegram am-detection are all ignored. Flip `AMHARIC_ENABLED` in `apps/miniapp/src/i18n/LanguageProvider.tsx` after professional translation QA. |
| Infrastructure | ⚠️ Currently an **ephemeral sandbox** — no real Telegram bot, no HTTPS domain, DB does not survive restarts. **Not usable for real users as-is.** |

## 2. Recommendation: a concierge soft pilot (not a public launch)

Invite **10–20 hand-picked candidates** (via your own network / parish referrals), English-only, with you personally operating the admin console daily. Goals:

1. Validate the core trust loop with real humans: onboarding → private review → approval → discovery → request → mutual → pairing thread.
2. Learn where real users hesitate, mistrust, or drop off — things no sandbox audit can find.
3. Generate real feedback messages to shape the product before any scale.

Two weeks is enough for a first cohort. Do not market publicly yet.

## 3. What must exist before the first real user (blocking)

1. **Real hosting with HTTPS** — a small VPS is fine. Nginx (or Caddy) serving the built Mini App + Admin static bundles and proxying `/api` to the API on :4000. Run API via systemd/pm2. Set `APP_ORIGIN` to the real https domain (enables secure cookies + CSRF origin checks).
2. **Real Telegram bot** — create via @BotFather, attach the Mini App URL (must be HTTPS), put the token in the API env, and enable real submissions (`ENABLE_REAL_SUBMISSIONS=true` is already the default config path).
3. **Rotate secrets** — new strong `ADMIN_CONSOLE_PASSWORD` (the current one lived in a sandbox), fresh session/encryption keys per the deployment notes in `docs/`.
4. **Backups** — `pg_dump` nightly + copy off-box. The sandbox wiped our DB twice this week; a real pilot cannot afford that.
5. **Data-sovereignty decision** — Proclamation 1321/2024 treats religious belief and facial images as sensitive data with localisation duties (Art. 22). Either host in Ethiopia or document the compliance path before collecting real photos/faith data. The privacy notice already cites the Proclamation; make sure the operator identity/contact in `/privacy` and `/terms` is the real legal entity before inviting users.
6. **Operator runbook** — daily queue review (target <24h), feedback triage, approval/decline etiquette, photo-purge discipline (30 days post-approval), incident contact.

## 4. Nice-to-have for the pilot (non-blocking)

- Uptime/error monitoring (a free-tier healthcheck ping on `/ready` + log shipping) — even a cron + Telegram message to yourself works.
- A second admin operator or a shared escalation channel (single-password console has no roles/audit-per-user).
- Seed 6–10 synthetic discovery cards so the first approved users don't see an empty deck (or stagger approvals so real cards exist).

## 5. What to measure (first 2 weeks)

| KPI | Why |
|---|---|
| Onboarding start → submit rate | Where the 7-step form loses people |
| Submit → decision turnaround | Your concierge SLA; trust signal |
| Approvals vs declines + decline reasons | Gate calibration (age/EOTC/intent) |
| Swipes & requests per active user | Discovery value |
| Mutual → confirmed → paired conversion | The core loop health |
| Feedback themes + support questions | Product roadmap input |
| Return rate (day 3 / day 7) | Whether the value proposition sticks |

## 6. Amharic activation plan (after the pilot starts)

1. You send the reviewed translations from the professional transcriber (review sheet: `docs/i18n-review-sheet.csv`, 451 rows).
2. We merge corrections into `tools/am_phrases.py`, regenerate `am.ts`, and hex-audit.
3. QA pass in-browser with `AMHARIC_ENABLED=true` on a staging URL (fonts, layout overflow, gender-neutral register).
4. Flip the constant in production — detection + manual toggle go live together. No other code change needed; the gate was built for exactly this.

## 7. Suggested sequence (this month)

1. Pick host + domain; deploy stack behind HTTPS (I can produce a deploy script/runbook for your server).
2. BotFather setup; smoke-test with 2–3 real Telegram accounts (you + team).
3. Backups + monitoring + secret rotation.
4. Recruit cohort 1 (10–20), concierge-operate 2 weeks.
5. Review KPIs + feedback; iterate.
6. Amharic QA → enable; plan cohort 2.
