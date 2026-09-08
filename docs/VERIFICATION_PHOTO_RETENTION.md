# Verification-photo retention (Option A — thumbnail at approval)

Private verification photos are stored encrypted and minimised aggressively:

- **While under review** the full-resolution image is kept (an administrator
  needs it to confirm identity).
- **At the moment an administrator approves** the profile, the full-resolution
  image is **replaced in place** by a small downscaled JPEG **thumbnail**
  (longest edge ≤ 240 px, ~a couple of KB) for a brief dispute/appeal window.
- The retained thumbnail is **deleted 14 days after approval** by the retention
  cron. After that only the audit/tombstone row remains (ciphertext wiped).

This is a privacy-minimisation decision (a face is sensitive personal data
whether it is full-size or a thumbnail), not primarily a storage one — the
stored ciphertext is small. It is a deliberate trade-off: we keep enough
evidence for a short dispute window and then delete it, and during the pilot we
measure how often an approval is ever contested.

For reference, the historical rationale for a flat 30-day hold only was to leave
an appeal window; Option A shortens that to 14 days and drops the full image —
both more privacy-friendly.

## Where this is enforced

- The swap happens in `AdminService.decide` when the decision is `approved`
  (`degradeVerificationPhotoToThumbnail`), using `jimp` to downscale.
- The retained ciphertext is purged by `POST /internal/retention`
  (`VERIFICATION_PHOTO_RETENTION_DAYS = 14`).
- `replaceVerificationPhoto` (repositories) writes the thumbnail back into the
  existing `verification_photo` row without resetting `approved_at`/`deleted_at`.

## The retention endpoint

```
POST /internal/retention
Authorization: Bearer <RETENTION_CRON_SECRET>
```

Finds photos whose 14-day post-approval window has elapsed and wipes their
ciphertext in place. Returns `{ "data": { "purged": <count> } }`.

- The endpoint is **not registered** unless `RETENTION_CRON_SECRET` is set
  (it then responds `404`, which is safe).
- With a wrong/missing bearer secret it returns `401`.
- Candidate sessions can never call it (it uses a separate bearer secret, not
  the session cookie/CSRF path).

## Enabling the daily schedule (Vercel)

The cron entry is already committed in `apps/api/vercel.json`
(`0 2 * * *` → `/internal/retention`). It is inert until the secret is set.

To activate:
1. On the **API** project set `RETENTION_CRON_SECRET` to a long random value.
2. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`, so set
   `CRON_SECRET` to the **same value**.

Alternatively trigger it daily from any scheduler (GitHub Actions, an external
uptime/cron service) with `Authorization: Bearer <RETENTION_CRON_SECRET>`.

## When the retention clock starts

`verification_photo.approved_at` is stamped when an administrator approves the
profile. Until approval the full image is retained; at approval the full image
becomes a thumbnail; the thumbnail is purged 14 days after approval.
