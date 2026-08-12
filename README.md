# Kidan

Repository: <https://github.com/RandomCreatives/KIDAN>

A privacy-first Telegram Mini App scaffold for intentional Orthodox Christian introductions.

> **Working name:** Kidan is a placeholder and can be changed without affecting the architecture.

## What is included

- Seven-step privacy-labeled onboarding prototype with synthetic in-memory draft data
- Exact anonymous public-profile preview before consent
- Modern mobile-first discovery experience with swipe and accessible action buttons
- Anonymous, synthetic values-first profiles
- Connection states that reflect mutual interest and admin review
- Telegram Mini App bridge with browser-safe fallback
- Fastify API scaffold with server-side Telegram init-data validation and optional opaque PostgreSQL sessions
- grammY bot scaffold that sends generic notifications only
- Shared Zod contracts
- Privacy-oriented PostgreSQL migrations for identity separation, discovery, audit, and session foundations
- OpenCode collaboration files (`AGENTS.md`, `opencode.json`, specialist agent, handoff log)

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

Copy `.env.example` to `.env` only when configuring local services. PostgreSQL-backed Telegram sessions require `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `IDENTITY_ENCRYPTION_KEY_BASE64`, `IDENTITY_LOOKUP_PEPPER`, and `SESSION_TOKEN_PEPPER`. Never commit `.env`.

## Verification

```bash
npm run check
```

## Important boundaries

The scaffold does not ingest channel profiles and contains no real personal data. Contact details are not part of discovery payloads. See `docs/security-and-privacy.md` before adding authentication persistence, photos, admin access, or messaging.
