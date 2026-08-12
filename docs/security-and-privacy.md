# Security and Privacy Baseline

## Data classes

### Discovery data
Approved age, coarse city, broad education/employment categories, selected values, optional bio, faith preferences, and a random public code.

### Identity-vault data
Telegram user mapping, verified name, phone, date of birth, verification evidence. Encrypt sensitive fields with managed keys distinct from database credentials.

### Safety data
Blocks, reports, moderation actions, review evidence, and audit events. Never expose these in discovery.

## Authentication
- Validate raw Telegram Mini App `initData` on the API using HMAC-SHA-256.
- Exclude `hash` and `signature` from the data-check string; sort remaining fields.
- Constant-time compare the computed and received hash.
- Reject stale `auth_date` and malformed or bot users.
- Exchange successful validation for a short-lived opaque application session.
- Persist only keyed hashes of session tokens; never store raw tokens in PostgreSQL.
- Store Telegram identifiers inside the identity vault as encrypted values plus keyed lookup hashes; do not copy them into discovery tables, audit metadata, or client-visible tokens.
- Never log raw init data, because it contains account attributes.

## Authorization
- Deny by default.
- A profile owner may edit private drafts but cannot self-approve.
- A discovery response is a server-created projection, never a serialized database row.
- Identity reveal is a separate operation requiring connection state, both confirmations, administrator approval, and an audit event.
- Block relationships override every discovery and connection state.

## Browser and API controls
- Strict Content Security Policy in production.
- Secure, HttpOnly, SameSite cookies where compatible with the Telegram WebView deployment model.
- Origin validation, CSRF protection for cookie-authenticated mutations, and idempotency keys.
- Per-user and per-device rate limits; aggressive limits on discovery enumeration and reports.
- No third-party trackers, ad pixels, session replay, or remote fonts by default.

## Media
The first release uses values-only discovery and never displays candidate photos. A verification photo is admin-only identity evidence: private object storage, EXIF removal, re-encoding, malware checks, size limits, authorization on every retrieval, and no bot transport. Schedule deletion 30 days after approval; backup copies must expire under the documented backup-retention schedule. A safety/legal hold must be exceptional, access-controlled, documented, and audited.

Any future discovery-photo feature requires a different upload and separate consent. The verification photo cannot be repurposed. Do not claim screenshot prevention.

## Logging
Structured allowlist logging only. Redact request bodies on auth, identity, reports, and contact reveal routes. Admin identity access is always audited.

## User controls
Provide profile pause, consent withdrawal, correction, export, and deletion. Retention periods and Ethiopian data-residency/cross-border requirements must be approved before real-user launch.

## Prohibited
- Profile scraping/import for population
- AI training on user content
- Attractiveness, complexion, or health ranking
- Exact location or congregation display
- Contact details in bot messages
- Shared administrator credentials
