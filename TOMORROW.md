# Restart sheet — info hub branch (saved 2026-09-17 night)

## Where we are
- Branch `ship/info-site-public-concern` in `/home/user/kidan-pr2-live-1f948`. **All code complete + verified** (typecheck, 210 API / 22 bot / 152 miniapp / 8 admin tests, build — all green).
- **No git remote exists.** The branch, `apps/info/`, and all changes live ONLY in this workspace. Vercel can't see them → that was tonight's blocker.
- Uncommitted-but-persisted work: 17 modified files + `apps/info/`, `apps/api/src/routes/publicFeedback.ts`, `apps/api/test/publicFeedback.test.ts`, `database/migrations/0010_public_concern_submissions.sql`, + tonight's edit `apps/admin/vercel.json` (root `/` rewrite → `/feedback`).
- Nothing committed yet on this branch — safe to commit in one go tomorrow before pushing.

## What is DONE tonight
1. ✅ **Step 1 — Neon staging migration `0010` APPLIED** (`Applied 0010_public_concern_submissions.sql`). Do NOT re-run (idempotent anyway).
   - The staging `DATABASE_URL` was pasted in chat tonight (pooler URL, eu-central-1). Don't paste it again; just reuse from the conversation scroll-back if needed.

## Tomorrow, in order
1. **Create the GitHub repo** (you, ~1 min): github.com/new → your usual repo name → keep empty (no README/license) → paste the URL to me.
2. **I push**: `git remote add origin <url>`, commit the branch, `git push -u origin ship/info-site-public-concern` (likely via a token you paste for the push).
3. **Step 2 — Vercel info project** (you, dashboard ~2 min): Add New → Project → import repo → Name `kidan-staging-info`, **Root Directory = `apps/info`** (the dropdown will work once pushed), Framework **Other**, all build fields **empty**, no env vars → Deploy → paste me the live URL.
4. **Step 3 — Env vars** (you, dashboard): API project → Settings → Environment Variables → `INFO_ORIGIN=https://<info-domain>`; bot project → `INFO_BASE_URL=https://<info-domain>`. Then **Redeploy** both latest deployments (Deployments → … menu → Redeploy) so the vars take effect.
5. **Step 4 — Smoke test**:
   - a) You: open `https://<info-domain>/report.html`, submit a test concern.
   - b) You (skipped giving me the password): open `https://kidan-staging-admin.vercel.app/feedback`, log in with `ADMIN_CONSOLE_PASSWORD` — the report should appear with topic/contact + bump unread badge.
   - c) You: Telegram → open `@kdatingxbot` DM → `/start` — menu keyboard should show the 5 info buttons and they should open the info pages.
   - If anything's off, paste me the symptom/error and I'll debug.

## Reminders for the assistant tomorrow
- Don't re-ask for: DATABASE_URL (used tonight), ADMIN_CONSOLE_PASSWORD (user skips), TELEGRAM bot token + chat id (user checks manually in Telegram).
- User picked the **Vercel dashboard** path over CLI; keep giving exact clicks, not CLI commands, unless they change their mind.
- Bot menu buttons only render when `INFO_BASE_URL` is set on the **bot** service and the bot has been redeployed after the env change.
