# Kidan — Data Policy (Track E4)

Status: for pilot operation and, later, the monetization/legal review. This
documents what data Kidan holds, how long, who may access it, and the
deletion/retention guarantees. It is the source for the user-facing privacy
disclosures; the engineering invariants are in `docs/security-and-privacy.md`.

---

## 1. Data classes

| Class | Fields | Where stored |
|---|---|---|
| **Discovery data** | age (derived), coarse city, broad education/employment category, selected values, optional bio, faith preferences, marriage goal, godfather/deacon/church-service flags, public code | `discovery_profile` |
| **Matching-only** | disability flag, partner-preference internals | onboarding draft / profile (never projected to other users) |
| **Identity vault** | Telegram id mapping, verified name, phone, date of birth | `identity_vault` (encrypted at rest) |
| **Verification evidence** | private verification photo | `verification_photo` (encrypted; admin-only) |
| **Safety / audit** | admin decisions, feedback notes (encrypted), operational signals | `admin_review`, `audit_event` |
| **Intro requests/connections** | request status, connection lifecycle, introduction messages | `introduction_request`, `connection`, `introduction_message` |

---

## 2. Access & minimization

- Discovery and introduction surfaces are **values-only**: public code, age,
  city, gender, values, bio, faith basics. **No name, photo, phone, or contact.**
- Identity is revealed only after: an accepted introduction request → both
  participants confirm → an administrator approves → a restricted in-app
  introduction opens. Name/phone/Telegram are **not** exposed in the pilot.
- The **verification photo** is admin-only identity evidence and is never shown
  in discovery or to other candidates.
- The bot never sends one user's information to another; one-sided interest and
  declines are never disclosed.
- No third-party analytics, trackers, ad pixels, session replay, or remote
  fonts for candidate data.

---

## 3. Retention

| Data | Retention |
|---|---|
| Verification photo (full image) | Kept only **while under review**; replaced by a small thumbnail at approval |
| Verification thumbnail (≤ 240 px) | Deleted **14 days after profile approval** (cron) |
| Unanswered introduction requests | Purged **72 hours** after creation |
| Swipe + request records for a connected pair | Deleted at the moment the pair connects |
| Onboarding draft (public/matching) | Until submitted; held for review decisions |
| Audit operational signals | Append-only (no identity) |
| Sessions | Short-lived; expiring/revocable |

## 4. User rights (self-serve)

Candidates can:
- Export their own data (`/v1/onboarding/export`) and
- Delete their account and all personal data (`/v1/onboarding/delete-account`),
  which cascades the identity vault, profile, draft, sessions, photo, consents,
  decisions, and connection rows.

## 5. Incident escalation

If identity or verification data is exposed, or a data-subject right can't be
honored:
1. Contain: freeze the affected path, rotate secrets (`MONITOR_CRON_SECRET`,
   bot token, DB/encryption keys via the secret manager).
2. Preserve audit evidence; determine scope without expanding access.
3. Notify affected candidates and the relevant authority per Ethiopian
   data-residency and data-protection requirements.
4. Record the incident and the corrective action in the ops runbook.

---

## 6. Data residency & the monetization decision

- **Ethiopian data-residency and cross-border rules must be approved before any
  real-user production launch.** Staging is a controlled pilot.
- Monetization (e.g. the future credit system) is **not authorized** in the
  pilot and waits on the 3–6 month study of dating culture, needs, behaviors,
  expectations, operating costs, and legal constraints. Payments/credits/wallet/
  ratings/review-gating are out of scope until then.
- The verification photo **cannot be repurposed** for any future discovery-photo
  feature; that would require a separate upload and separate consent.
