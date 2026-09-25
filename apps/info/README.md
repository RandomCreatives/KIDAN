# apps/info — Kidan public info hub

Static public site: how it works, rules, privacy notice, FAQ, and "Report a concern"
(anonymous web form that posts to the API's public endpoint `POST /v1/public/feedback`).

- Plain HTML/CSS/JS — no build step, no framework, no build dependencies.
- Deploy as its own Vercel project with the **root directory set to `apps/info`**,
  framework preset "Other", no build command, output `.`.
- `assets/report.js` pins `API_BASE` (staging today; swap when promoting to production).
- The Telegram bot links here via the `INFO_BASE_URL` env var on the bot service
  (e.g. `https://kidan-staging-info.vercel.app`), and the API accepts this origin via
  the `INFO_ORIGIN` env var for browser CORS/preflight.
