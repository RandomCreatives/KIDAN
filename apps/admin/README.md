# Kidan Review Console (B3)

A **separate, password-protected operator web app** for reviewing submitted
candidates. It is intentionally independent of the Telegram Mini App:

- Candidates authenticate with Telegram initData; operators authenticate with a
  single provisioned password (`ADMIN_CONSOLE_PASSWORD`).
- The console uses its own session cookie (`kidan_admin_session`) and never
  shares a session with a candidate.
- Private details (full name, phone number, date of birth) and the verification
  photo are decrypted **only** after an operator signs in and opens a
  submission. The review queue shows public codes only.

## Decisions

For each pending submission an operator can:

- **Approve** — the candidate is activated (`app_user.status = 'active'`), the
  discovery profile is marked approved, and `verification_photo.approved_at` is
  stamped, **starting the 30-day photo-deletion clock** (the B5 retention job
  then wipes the photo 30 days later).
- **Request changes** — the candidate's onboarding draft is reopened so they can
  revise and resubmit; an encrypted feedback note is required and shown to the
  candidate.
- **Reject** — the profile is suspended and not published; an encrypted
  feedback note is required.

Every decision appends an immutable `admin_review` audit row attributed to the
seeded pilot administrator and updates the latest-decision `profile_review`
row. Feedback notes are encrypted at rest (AES-256-GCM), like identity data.

## Deployment

1. **API project** — set the environment variable:
   - `ADMIN_CONSOLE_PASSWORD` = a long, random operator password.
   The `/v1/admin/*` endpoints return 404/are inert until this is set.
2. **Console project** — deploy `apps/admin` as its own Vercel project
   (framework: Vite; root directory `apps/admin`). Its `vercel.json` proxies
   `/api/*` to the API deployment and serves the SPA for everything else. The
   production API origin in `apps/admin/vercel.json` is currently the staging
   API (`https://kidan-staging-api.vercel.app`); point it at the production API
   when promoting.
3. Keep the console URL private. It sends `X-Robots-Tag: noindex`,
   `X-Frame-Options: DENY`, and a strict CSP.

Local development: run the API (`npm run dev:api`) and the console
(`npm run dev -w @kidan/admin`, port 5174); the console proxies `/api` to
`localhost:4000`.
