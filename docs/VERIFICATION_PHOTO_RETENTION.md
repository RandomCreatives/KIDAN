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

1. On the **API** project, set the environment variable
   `RETENTION_CRON_SECRET` to a long random value.
2. To use Vercel Cron (which calls the path with `Authorization: Bearer
   <CRON_SECRET>`), set `CRON_SECRET` to the **same value** and add to
   `apps/api/vercel.json`:

   ```json
   "crons": [
     { "path": "/internal/retention", "schedule": "0 2 * * *" }
   ]
   ```

   (The cron entry is intentionally not committed by default so it cannot
   interfere with environments that have not provisioned the secret.)

Alternatively, trigger the endpoint once a day from any scheduler (cron job,
GitHub Actions scheduled workflow, uptime monitor) with the bearer header.

## When the 30-day clock starts

`verification_photo.approved_at` is stamped when an administrator approves the
profile (Phase 03 / B3 admin console). Until approval the photo is retained so
an administrator can verify identity; after approval the 30-day window begins.
