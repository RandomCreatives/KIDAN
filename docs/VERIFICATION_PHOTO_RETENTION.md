# Verification-photo retention (30-day deletion)

Private verification photos are stored encrypted and scheduled for deletion
**30 days after profile approval**.

## The retention endpoint

The API exposes a bearer-protected maintenance endpoint:

```
POST /internal/retention
Authorization: Bearer <RETENTION_CRON_SECRET>
```

It finds photos whose 30-day post-approval window has elapsed and wipes their
ciphertext in place. It returns `{ "data": { "purged": <count> } }`.

- The endpoint is **not registered** unless `RETENTION_CRON_SECRET` is set
  (it then responds `404`, which is safe).
- With a wrong or missing bearer secret it returns `401`.
- Candidate sessions can never call it (it uses a separate bearer secret, not
  the session cookie/CSRF path).

## Enabling the daily schedule (Vercel)

The cron entry is already committed in `apps/api/vercel.json`
(`0 2 * * *` → `/internal/retention`). It is inert until you provision the
secret: the endpoint returns `404` when `RETENTION_CRON_SECRET` is unset, so
shipping the cron entry before the secret exists is safe.

To activate:

1. On the **API** project, set `RETENTION_CRON_SECRET` to a long random value.
2. Vercel Cron invokes the path with `Authorization: Bearer <CRON_SECRET>`, so
   set `CRON_SECRET` to the **same value**.

Alternatively, trigger the endpoint once a day from any scheduler (cron job,
GitHub Actions scheduled workflow, uptime monitor) with
`Authorization: Bearer <RETENTION_CRON_SECRET>`.

## When the 30-day clock starts

`verification_photo.approved_at` is stamped when an administrator approves the
profile (Phase 03 / B3 admin console). Until approval the photo is retained so
an administrator can verify identity; after approval the 30-day window begins.
