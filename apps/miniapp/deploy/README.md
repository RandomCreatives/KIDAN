# Mini App same-origin production host

`nginx.conf` is the reviewed production-serving configuration for the built Mini App. It:

- serves the static Mini App from `/usr/share/nginx/html`;
- sends the production Content-Security-Policy and companion security headers on responses, including SPA fallbacks;
- proxies same-origin `/api/` requests to the API service named `kidan-api` on port `4000`;
- preserves the external host and scheme for API origin/cookie checks.

The deployment platform must terminate HTTPS before this server (or add TLS directly) and must preserve `X-Forwarded-Proto: https`. The API environment must set `APP_ORIGIN` to the exact public HTTPS Mini App origin and keep `ENABLE_REAL_SUBMISSIONS=false`.

The CSP value is intentionally duplicated in Nginx because Nginx cannot import the TypeScript policy generator. `src/lib/csp.test.ts` is the required drift test and fails if the generated production policy and Nginx response header differ.

## Deployment verification gate

This configuration is not evidence that a host has been deployed. On the approved synthetic test host, record at minimum:

```sh
curl --fail --silent --show-error --dump-header headers.txt --output /dev/null \
  https://REDACTED-TEST-HOST.example/
grep -i '^content-security-policy:' headers.txt
```

The redacted record must identify the exact deployed commit SHA and must demonstrate the same-origin `/api` flow in Telegram. Do not publish cookies, raw Telegram `initData`, CSRF values, Telegram identifiers, bot tokens, or private data. Use `docs/evidence/phase-02/OPERATOR_RECORD_TEMPLATE.md` for the complete gate.

If the approved platform uses a CDN or managed header configuration instead of Nginx, reproduce the same policy there, retain the drift check or an equivalent deployment test, and update this directory truthfully before merge.
