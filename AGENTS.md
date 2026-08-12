# Kidan — Agent Guide

## Mission
Build a privacy-first Telegram Mini App for intentional Orthodox Christian introductions. The product is anonymous in discovery, values-first, and permits communication only after mutual interest, administrator approval, and both users' final confirmation.

## Start every task
1. Read `docs/HANDOFF.md` and the document relevant to the task.
2. Inspect the current diff before editing.
3. Keep work to one reviewable concern.
4. Run the narrowest tests while working, then `npm run check` before claiming completion.
5. Update `docs/HANDOFF.md` with changes, verification, decisions, and next work.

## Repository
- `apps/miniapp` — React/Vite Telegram Mini App.
- `apps/api` — Fastify API and Telegram init-data authentication.
- `apps/bot` — grammY bot; generic notifications only.
- `packages/contracts` — shared Zod schemas and domain types.
- `database/migrations` — append-only PostgreSQL migrations.
- `docs` — durable product, architecture, privacy, and handoff context.

## Non-negotiable privacy rules
- Never expose names, phone numbers, Telegram IDs/usernames, dates of birth, exact workplace, exact address, or exact parish in discovery.
- Never put profile or contact data in bot notifications.
- Never log Telegram init data, bot tokens, session tokens, identity fields, or message content.
- Identity-vault data and discovery-profile data remain separated.
- Contact reveal requires: mutual interest + admin approval + confirmation from both users.
- Do not add scraping/import code to the product. Channel samples are for schema research only.
- Do not train AI on profiles, photos, reports, or conversations.
- Do not weaken authorization, rate limits, audit logging, or consent checks to simplify development.
- Never use `initDataUnsafe` as authentication; validate raw Telegram `initData` on the server.

## Engineering conventions
- TypeScript strict mode. Avoid `any`; use `unknown` and narrow it.
- Shared API payloads belong in `packages/contracts`.
- Keep transport handlers thin; business rules belong in services/domain modules.
- Use stable enum-like string unions in storage and localize labels in the UI.
- Store height as integer centimeters and derive displayed age from private date of birth.
- Database migrations are append-only once committed.
- No secrets in source, fixtures, screenshots, or handoff documents.
- Public profile codes are random, neutral, non-sequential, and not authentication secrets.

## Commands
```bash
npm install
npm run dev
npm run dev:api
npm run dev:bot
npm run typecheck
npm test
npm run build
npm run check
```

## Current scope
The scaffold uses synthetic demo profiles. Real persistence, identity collection, media upload, admin UI, and contact reveal are intentionally not implemented until their threat model and retention rules are approved. Read `docs/questionnaire-analysis.md` before changing onboarding, profile contracts, faith fields, verification media, or payment states.
