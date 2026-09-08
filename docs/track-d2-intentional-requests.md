# Track D2 — Intentional introduction requests + profile refinements

Status: design approved (pilot). Branch: `feature/intentional-requests`.
Supersedes the "mutual swipe → admin" trigger in Track D. Track E follows after.

## Product rules (decided)

### Intentional-request funnel
1. **Swipe right (pass/interested) is private and free.** "Interested" adds the card
   to the caller's own shortlist only. It never notifies anyone and never creates an
   admin item. One-sided choices stay hidden (existing privacy rule preserved).
2. **Formal introduction request = the committed act.** A user sends a request from
   their shortlist to at most **5 recipients per rolling 24 hours** (policy constant,
   tunable). Exceeding → `INTENTION_RATE_LIMIT` (429).
3. **Recipient evaluates before responding.** A request shows the sender's
   **strong-basics values summary** (values-only; no name, photo, phone, or contact):
   public code, age, city, education/occupation, values, bio, marriage goal,
   godfather, deacon, church-service-active. Recipient **accepts or declines**.
4. **Declines are soft.** The requester only sees `pending` until the request is
   **accepted** or **expires at 72h**. Declines are not surfaced (no ghosting/stood-up
   signal). Expired unanswered requests are auto-purged.
5. **Accepted → both participants confirm → administrator approves → restricted
   in-app chat opens.** Admin sees only pairs that are accepted AND confirmed by both.
6. **Data minimization:** when a pair reaches `connected`, that pair's swipe and
   request records are deleted. Unanswered requests are purged 72h after creation
   (cron; same mechanism as the 30-day verification-photo purge).
7. **Reflection UI:** a "Your shortlist" surface shows recent right-swipes (last
   ~15 min highlighted) and the request action with a "5 per day" counter.

### Profile / eligibility changes
- **Age eligibility: 21–45** (hard). Applies to candidate date-of-birth gate and
  partner-preference age bounds (previously 18–90).
- New onboarding answers:
  - **Godfather?** (y/n) — faith/family. Shown on summary.
  - **Deacon?** (y/n, asked to men) — faith/family. Shown on summary. If yes,
    marriage goal pre-selects `teklil` but remains changeable.
  - **Marriage goal:** `teklil` (Holy Matrimony) / `kidusan_kurban` (Holy Communion) /
    third "Either" option. Shown on summary (compatibility core).
  - **Disability?** (y/n) — collected; **matching-only**, never on card/summary.
  - **Currently active in church service?** (y/n) — shown on summary (strong basic).

### Field visibility (values-only summary/discovery vs matching-only)
- Shown on discovery card + request strong-basics summary: existing public fields
  PLUS godfather, deacon, marriage goal, church-service-active.
- Matching-only (never shown to other users; used for careful matching/admin):
  disability, partner-preference internals (age ranges, cities), contact details.

## Data model (migration 0007)
- `discovery_profile` add: `has_godfather bool`, `is_deacon bool` (men; null for N/A),
  `church_service_active bool`, `has_disability bool null` (optional/matching-only).
- New `introduction_request`:
  `id uuid pk`, `sender_user_id uuid`, `recipient_user_id uuid`,
  `status enum('pending','accepted','declined','expired') default 'pending'`,
  `created_at`, `expires_at = created_at + 72h`, `responded_at null`.
  Unique `(sender_user_id, recipient_user_id)` (one live request per ordered pair);
  a pair is at most one connection; mirrored requests reconcile into the same pair.
- Reuse `connection` for post-acceptance. New connection status:
  `request_accepted_pending_confirmation` (both confirm) before admin approval;
  admin approval then proceeds as Track D (`admin_approved_pending_confirmation` is
  replaced/renamed in this flow — admin acts LAST).

## Funnel state machine
```
swipe(interested) -> private shortlist (no notification)
send request (≤5/24h) -> introduction_request[pending] (72h TTL)
recipient accepts  -> introduction_request[accepted] + connection[request_accepted_pending_confirmation]
recipient declines -> introduction_request[declined] (invisible to sender; purged on expiry)
72h no response    -> introduction_request[expired] + purge
both confirm       -> connection[mutual_confirmed_pending_admin]  (admin queue)
admin approves     -> connection[connected] -> restricted chat; delete pair swipes+requests
admin rejects      -> connection[admin_rejected]
either declines pre-connect -> connection[declined]
```

## API surface
- `POST /v1/discovery/request { targetPublicCode }` → 429 `INTENTION_RATE_LIMIT` when
  over cap; 409 if a live request already exists; idempotency key.
- `GET /v1/requests/incoming` → pending requests addressed to the caller with the
  sender's strong-basics summary.
- `GET /v1/requests/outgoing` → the caller's sent requests with `pending/accepted`
  state only (never `declined`).
- `POST /v1/requests/:id/respond { accept: boolean }`.
- Reuse `POST /v1/connections/:id/confirm` for the post-acceptance both-confirm step.
- Admin queue (`GET /v1/admin/connections`) now lists `mutual_confirmed_pending_admin`.
- Rate limit checked in service layer against `introduction_request.created_at`
  in the rolling prior 24h.

## Cron / retention
- Extend the retention job: purge `introduction_request` rows past `expires_at` and
  delete swipe/request rows for `connected` pairs.

## Tests
- Contracts: new schemas/enums, age 21–45, visibility map.
- API: rate limiting (5/24h), soft-decline invisibility, 72h expiry, state machine,
  admin sees only accepted+confirmed, pair-record deletion on connect.
- Miniapp: shortlist + request action, incoming summary accept/decline, counter.
