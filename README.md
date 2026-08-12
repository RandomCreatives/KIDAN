# Kidan

Repository: <https://github.com/RandomCreatives/KIDAN>

A privacy-first Telegram Mini App for intentional Orthodox Christian introductions.

> **Working name:** Kidan is a placeholder and can be changed without affecting the architecture.

## What is included

- Seven-step privacy-labeled onboarding prototype with synthetic browser data
- Modern values-first, photo-free discovery prototype
- Exact anonymous public-profile preview before consent
- Server-validated Telegram authentication exchanged for opaque cookie sessions
- PostgreSQL migrations, checksum tracking, and resumable onboarding drafts
- Encrypted identity-vault boundary separated from public and matching data
- Consent receipts and review-pending submission workflow
- Mutual-interest, administrator-review, final-confirmation, and block policy gates
- grammY bot scaffold that sends generic notifications only
- Shared Zod contracts and durable OpenCode collaboration files

Real identity submission remains disabled by default. Verification-photo upload, admin review UI, direct contact reveal, and production database hosting are not implemented.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Mini App runs in browser demo mode when it is not opened by Telegram.

API and bot run separately:

```bash
npm run dev:api
npm run dev:bot
```

The API loads a root `.env` file when present. Copy `.env.example` to `.env` only for local configuration; never commit `.env`.

## Local PostgreSQL

Docker Compose starts PostgreSQL on the loopback interface only:

```bash
npm run db:up
npm run db:migrate
npm run dev:api
```

Generate three independent 32-byte keys for `.env` (do not reuse a value):

```bash
openssl rand -base64 32
```

Use `GET /health` for process liveness and `GET /ready` for database readiness. Stop the local database with `npm run db:down`. The Compose password is development-only.

## Verification

```bash
npm run check
npm audit --audit-level=low
```

Arena does not provide Docker or PostgreSQL, so migration execution and PostgreSQL integration must also be verified in a local or CI environment with PostgreSQL available.

## Important boundaries

The repository contains no real personal data and does not ingest channel profiles. Discovery responses use explicit allowlisted projections and public codes, never database rows or internal user IDs. Names, phone numbers, dates of birth, Telegram IDs, matching preferences, and verification media are excluded from discovery. See `docs/security-and-privacy.md` before enabling real submissions, media, admin access, or introductions.
