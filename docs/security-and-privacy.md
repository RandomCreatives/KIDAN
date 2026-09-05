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
- Raw init data is transmitted to Kidan and may contain Telegram account attributes. The current validator extracts the Telegram ID and authentication date; the service retains an encrypted/hash-indexed Telegram ID mapping and the session authentication date, but does not put Telegram names/usernames into the public draft or discovery projection.
- Never log raw init data, because it contains account attributes.
- Logout is successful only after the final cookie-backed session is revoked with 204 or validly confirmed absent with 401. Ambiguous transport/server failures remain visible and retryable; automatic recovery cannot run after terminal logout intent.

## Authorization
- Deny by default.
- A profile owner may edit private drafts but cannot self-approve.
- A discovery response is a server-created projection, never a serialized database row.
- Identity reveal is a separate operation requiring connection state, both confirmations, administrator approval, and an audit event.
- Block relationships override every discovery and connection state.

## Browser and API controls
- Strict Content Security Policy in production. The reviewed Nginx candidate is `apps/miniapp/deploy/nginx.conf`; its drift test must pass, and the exact deployed HTTPS response header must be captured before merge.
- Secure, HttpOnly, SameSite cookies where compatible with the Telegram WebView deployment model.
- Origin validation, CSRF protection for cookie-authenticated mutations, and idempotency keys.
- Per-user and per-device rate limits; aggressive limits on discovery enumeration and reports.
- No third-party trackers, ad pixels, session replay, or remote fonts by default.

## Media
The first release uses values-only discovery and never displays candidate photos. A verification photo is admin-only identity evidence: private object storage, EXIF removal, re-encoding, malware checks, size limits, authorization on every retrieval, and no bot transport. Schedule deletion 30 days after approval; backup copies must expire under the documented backup-retention schedule. A safety/legal hold must be exceptional, access-controlled, documented, and audited.

Any future discovery-photo feature requires a different upload and separate consent. The verification photo cannot be repurposed. Do not claim screenshot prevention.

## Logging
Structured allowlist logging only. Redact request bodies on auth, identity, reports, and contact reveal routes. Admin identity access is always audited.

## Persistence foundation
- Application sessions are random opaque tokens; PostgreSQL stores only keyed HMAC-SHA-256 hashes and supports expiry and revocation.
- Identity values use AES-256-GCM with field-bound associated data and an independent keyed lookup hash. Keys must come from a managed secret service in production, not `.env` files.
- Public onboarding drafts exclude identity fields and use optimistic version checks.
- Submission creates explicit consent receipts and only transitions the user/profile to review-pending. No user route can approve a profile.
- Discovery identifiers are neutral public codes; internal database UUIDs are not part of discovery responses.
- Real identity and submission handling is feature-disabled by default. Production hosting remains blocked on Ethiopian data-residency and legal review.

## User controls
Provide profile pause, consent withdrawal, correction, export, and deletion. The schema records consent withdrawal time, but these user-control workflows are not implemented yet. Retention periods and Ethiopian data-residency/cross-border requirements must be approved before real-user launch.

## Prohibited
- Profile scraping/import for population
- AI training on user content
- Attractiveness, complexion, or health ranking
- Exact location or congregation display
- Contact details in bot messages
- Shared administrator credentials
