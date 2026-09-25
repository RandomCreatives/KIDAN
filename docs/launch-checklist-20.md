# Launch checklist: the "20 things" audit, adapted for Kidan

The viral checklist is written for a **marketing website**. Kidan is a Telegram
Mini App (no public crawlable surface), a Fastify API, and an operator review
console. Each item below is explained, given a verdict for this product, and —
where it mattered — implemented. Verdicts: **DONE** (already true in code),
**ADDED** (implemented in this pass), **ADAPTED** (the intent is met a
different way), **SKIP** (wrong fit for this product, with reasons).

| # | Item | Verdict | Where |
|---|------|---------|-------|
| 1 | Privacy policy page | ADDED (public) + DONE (in-app) | `apps/api/src/routes/publicPages.ts` (`/privacy`); in-app `PrivacyScreen.tsx` |
| 2 | Terms & conditions page | ADDED | `apps/api/src/routes/publicPages.ts` (`/terms`) |
| 3 | Secrets off the front end | DONE | only `VITE_API_BASE_URL`, `VITE_APP_ENV` reach bundles; keys live in server env |
| 4 | Force HTTPS | ADDED (HSTS + headers); TLS terminates at platform | `appFactory.ts` onSend hook; `secureCookies: production` in `runtimeApp.ts` |
| 5 | Cookie consent banner | SKIP (essential-only cookie) | explained in `/privacy` §7; sensitive-data consent captured in-app |
| 6 | Meta titles + descriptions | DONE | both `index.html` files already carried them; enriched miniapp OG set |
| 7 | Social preview image | ADDED | `apps/miniapp/public/og-image.png` + `og:*`/`twitter:*` tags |
| 8 | Favicon | ADDED | `apps/{miniapp,admin}/public/favicon.svg` + `<link rel="icon">` |
| 9 | Sitemap + robots.txt | ADAPTED (robots yes, sitemap no) | `public/robots.txt` = `Disallow: /` on both apps; admin also `noindex` |
| 10 | Alt text on images | DONE | exactly one `<img>` exists (admin verification photo) and it has `alt` |
| 11 | Compress your images | DONE | `onboarding/photoCapture.ts`: canvas downscale to 1280px, JPEG q0.82 client-side |
| 12 | Page load speed | DONE-ish, monitored | single-route SPA, no heavy deps; see notes below |
| 13 | Color contrast | ADDED (6 fixes + gold-ink token) | `miniapp/src/styles/global.css` |
| 14 | Mobile friendly | DONE | mobile-first miniapp, `viewport-fit=cover`, safe-area insets |
| 15 | Custom 404 page | ADDED (branded HTML for browsers; JSON kept for API) | `appFactory.ts` not-found handler + `publicPages.ts` |
| 16 | Fix broken links | DONE (none exist) | zero `<a href>` in app code; navigation is buttons/state |
| 17 | Form validation | DONE | server schemas per route + client guards (bio 20–280, age band, chips) |
| 18 | Spam protection | ADDED (transport rate limits) + DONE (initData signature, business caps) | `apps/api/src/security/ipRateLimit.ts` |
| 19 | Setup analytics | ADAPTED (self-hosted only) | admin funnel metrics; third-party analytics forbidden by design |
| 20 | One clear call to action | DONE | every screen has a single primary action by design |

## Notes per item

1. **Privacy policy.** Proclamation 1321/2024 makes religious belief and facial
   images *sensitive personal data* and imposes transparency duties, so a
   citable public URL matters (Telegram bot directory, parish partners,
   rights requests). The new `/privacy` states what is collected (encrypted
   vault vs anonymous public profile vs session data), what is never done
   (no ads, no trackers, no sale), legal basis (recorded consent receipts),
   rights (access/rectification/erasure/restriction/object) with the in-app
   self-serve export & delete, data localisation in Ethiopia, retention
   (photo purged 30 days post-approval, requests expire 72h), and security.
   The in-app Privacy & data rights screen remains the operational surface.
2. **Terms.** `/terms` covers eligibility, one-person-one-account, how
   introductions work (shortlist ≠ notification; connection = accepted
   request + dual confirm + admin approval), conduct (no contact exfil,
   respectful close), moderation discretion, no outcome warranties, licence,
   deletion, pilot status and Ethiopian governing law.
3. **Secrets.** Audited: the bundles receive only `VITE_API_BASE_URL` and
   `VITE_APP_ENV`. `SESSION_SECRET`, `IDENTITY_*_KEY`, `TELEGRAM_BOT_TOKEN`,
   `ADMIN_CONSOLE_PASSWORD` are server-side only; the admin password is
   verified server-side and never shipped.
4. **HTTPS.** TLS terminates at the hosting platform (Vercel/Telegram edge),
   which redirects HTTP→HTTPS. What the app can add, it now adds: cookies are
   `Secure` in production (`runtimeApp.ts`), and the API sends
   `Strict-Transport-Security: max-age=63072000; includeSubDomains` whenever
   secure cookies are on, plus `X-Content-Type-Options`, `X-Frame-Options:
   DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` always.
   Frontend hosts should keep platform HSTS enabled (Vercel does by default).
5. **Cookie banner.** The service sets one strictly-necessary session cookie
   (HttpOnly, SameSite=Strict, Secure in prod). Consent banners exist for
   *tracking* cookies; showing one for an essential cookie would be noise and
   would imply tracking exists. The consent that legally matters here —
   processing sensitive data — is captured as explicit toggles + receipt
   during onboarding. The privacy page explains this choice.
6. **Meta.** Titles/descriptions existed on both apps; the miniapp now also
   carries `og:type/site_name/title/description/image` and `twitter:card`.
7. **Social preview.** Generated brand card (forest green, gold medallion,
   serif wordmark) at `og-image.png`; referenced by absolute path so any host
   serves it from the miniapp root.
8. **Favicon.** Brand medallion SVG (forest disc, ivory cross-ring) on both
   apps, replacing the browser default glyph.
9. **Sitemap/robots.** There is no public content to index: the miniapp is an
   authenticated surface and the console is operator-only (already
   `noindex, nofollow`). Both apps now serve `robots.txt` with
   `Disallow: /`. A sitemap would only enumerate private routes — skipped
   deliberately; revisit if a public marketing site ever exists.
10. **Alt text.** The only `<img>` in the codebase (admin verification photo)
    already carries `alt="Verification document/photo"`. Miniapp visuals are
    inline SVG icons (aria-hidden by role) or CSS backgrounds of the user's
    own upload, so there is nothing else to label.
11. **Compression.** Already client-side: photos are canvas-downscaled to
    1280px max and re-encoded JPEG q0.82 before upload (with graceful
    fallback), which saves mobile upload bandwidth; the server caps bodies at
    6MB and returns a clean `PHOTO_TOO_LARGE` (413) otherwise.
12. **Load speed.** Single-route React SPA, no images in the bundle, system
    font stacks, one external script (the Telegram SDK, required before
    bootstrap). Keep an eye on bundle size in CI (`npm run build -w
    apps/miniapp`); code-splitting is unnecessary at current size.
13. **Contrast.** Measured every text/background pair against WCAG AA
    (4.5:1). Six failures fixed in the miniapp palette: header label, card
    eyebrow, action hint, deck footnote, inactive bottom-nav label (grays
    darkened), and gold kickers/status text moved to a new `--gold-ink`
    (#856634, 4.8:1 on ivory) while decorative gold (icons, borders, dots)
    keeps the original hue. Admin palette measured clean (≥5.1:1).
14. **Mobile.** The product *is* a mobile app inside Telegram: viewport with
    `viewport-fit=cover`, safe-area insets on nav/toasts, touch-sized swipe
    deck. The admin console is an operator tool designed for desktop but
    responsive.
15. **404.** Browsers hitting the API host now get a branded, on-voice 404
    ("Nothing here — and that is by design") with pointers to `/privacy` and
    `/terms`; API clients keep the stable `{ error: { code: "NOT_FOUND" } }`
    contract, and `/v1/*` never renders HTML.
16. **Broken links.** There are no anchors to break: all navigation is
    buttons/state, and the two new pages link only to each other.
17. **Validation.** Client guards (step completeness, bio 20–280 chars, chip
    minimums, age band) plus server-side schemas on every route; malformed
    initData is rejected cryptographically before any state is created.
18. **Spam.** Three layers now: (a) Telegram initData HMAC validation proves
    a real Telegram account; (b) business caps (5 requests/day, 72h expiry,
    message pacing); (c) NEW transport-level in-memory sliding-window IP
    limits on the abuse-sensitive endpoints — session minting (120/h),
    profile submit (30/h), photo upload (30/h) — returning 429
    `RATE_LIMITED` with `retryAfterSeconds`. Dependency-free, auto-disabled
    in tests, covered by `test/publicPagesAndHardening.test.ts`. No CAPTCHA:
    it would fight the Telegram UX and initData already outperforms it.
19. **Analytics.** Third-party analytics are prohibited by the privacy stance
    (and would process sensitive data without a basis). The product already
    ships its own privacy-first analytics: the admin funnel (admission →
    approval → requests → connections) plus PII-free operational/audit
    events. If deeper product analytics are wanted later, extend the
    self-hosted `pairing_event`/`audit_event` tables — never inject a
    tracker.
20. **One CTA.** Every screen was designed around a single primary action:
    splash "Begin", onboarding "Continue"/"Submit for review", gate
    "Continue", request sheet "Send", thread "Send", pilot-disabled
    "Review your draft". Secondary exits are deliberately ghost-styled.

## Verification performed (2026-09-13)

- `npm test -w apps/api`: 210 passed (incl. 6 new hardening tests).
- `npm test -w apps/miniapp`: 152 passed. `tsc` typecheck clean (both configs).
- Live smoke: `/privacy` & `/terms` 200 HTML; HTML 404 for browsers, JSON 404
  for `/v1`; security headers present; HSTS only with secure cookies;
  `robots.txt`/`favicon.svg`/`og-image.png` served by both frontends; rate
  limiter tripped at exactly 120 auth attempts then 429.
