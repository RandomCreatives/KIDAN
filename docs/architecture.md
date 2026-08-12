# Architecture

## Context

```text
Telegram client
  ├─ opens Mini App ──> apps/miniapp
  └─ talks to bot ────> apps/bot
                           │ generic notifications only
                           v
                       apps/api
                           │
             ┌─────────────┼─────────────┐
             v             v             v
       discovery data  identity vault  moderation/audit
             └───────────── PostgreSQL ─────────────┘
```

## Trust boundaries

### Mini App
Untrusted client. It may render approved discovery payloads but cannot decide authorization, match state, review state, or contact reveal. Telegram-provided `initDataUnsafe` is display-only.

### API
Validates raw Telegram init data, creates application sessions, enforces state transitions, filters discovery responses, applies rate limits, and records security-relevant events.

### Bot
Entry point and notification transport. Notifications are generic. The bot must not receive discovery profile content or identity-vault fields when a notification ID is enough.

### Identity vault
Contains encrypted Telegram mapping, verified name, phone, and date of birth. It is not joined into ordinary discovery queries. Access requires a narrow role and an audit event.

### Admin application
Future separate surface with phishing-resistant authentication, least-privilege roles, masked identity fields, and audited reveal actions.

## Domain state

Account:
`new -> identity_pending -> profile_pending -> active -> paused | suspended | deleted`

Connection:
`none -> interested_by_one -> mutual_pending_admin -> admin_approved_pending_confirmation -> connected`

Terminal/exception states include `passed`, `admin_rejected`, `declined`, `blocked`, and `closed`.

The `connected` state opens a restricted in-app introduction. It does not reveal a name, phone number, Telegram username, or direct-message link. A later contact exchange is a separate mutual-consent state and is not part of the initial connection transition.

## API direction
- Version all endpoints under `/v1`.
- Parse all boundary input with contracts from `@kidan/contracts`.
- Return an envelope with `data` or a stable error object.
- Use opaque server-side sessions in production; no Telegram identifiers in client tokens.
- Use idempotency keys for decisions and approvals.

## Public profile code
Generate a neutral code such as `KD-7M4Q9X` from a non-ambiguous random alphabet. Enforce uniqueness, never encode gender/age/date, never reuse, and never treat the code as a credential.
