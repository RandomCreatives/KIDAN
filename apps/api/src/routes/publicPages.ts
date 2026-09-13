import type { FastifyInstance } from "fastify";

/**
 * Public, unauthenticated legal pages (privacy notice + terms) and the shared
 * branded 404 shell. These exist so the pilot has citable public policy URLs
 * (Telegram bot directory, parish partners, Proclamation 1321/2024
 * transparency duties) without exposing any app surface to crawlers.
 */

const SHELL_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f6f3ed; color: #15241f; font: 16px/1.65 -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif; }
  header { background: #1f4b3c; color: #f6f3ed; padding: 28px 20px; }
  header .wrap, main { max-width: 720px; margin: 0 auto; padding: 0 20px; }
  header h1 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 26px; font-weight: 600; }
  header p { margin: 6px 0 0; color: #cfd8cf; font-size: 13px; }
  main { padding: 28px 20px 56px; }
  h2 { font-family: Georgia, serif; font-size: 19px; color: #15382e; margin: 30px 0 8px; }
  p, li { font-size: 15px; color: #33413b; }
  ul { padding-left: 20px; }
  .kicker { color: #856634; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .note { background: #fffdf9; border: 1px solid rgba(30,57,48,.14); border-radius: 12px; padding: 14px 16px; }
  footer { border-top: 1px solid rgba(30,57,48,.14); margin-top: 40px; padding: 18px 20px 40px; color: #56625d; font-size: 13px; }
  footer .wrap { max-width: 720px; margin: 0 auto; }
`;

function shell(title: string, kicker: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${title} · Kidan</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<header><div class="wrap"><h1>Kidan</h1><p>Private, values-first introductions</p></div></header>
<main>
<p class="kicker">${kicker}</p>
${body}
</main>
<footer><div class="wrap">Kidan pilot · This page is part of the Kidan service. In-app, the same notices appear on the Privacy &amp; data rights screen.</div></footer>
</body>
</html>`;
}

const PRIVACY_BODY = `
<h2>1. Who we are and what this covers</h2>
<p>Kidan ("we") operates a privacy-first introduction service for marriage-minded adults, delivered as a Telegram Mini App with an operator review console. This notice covers the Mini App, the review process and the introduction thread. It is written to satisfy the transparency duties of Ethiopia's Personal Data Protection Proclamation No. 1321/2024.</p>
<h2>2. What we collect</h2>
<ul>
  <li><strong>Private identity vault (encrypted at rest):</strong> legal name, phone number, date of birth and one verification photo. These are stored encrypted, are never shown in discovery, and the photo is visible only to the reviewing administrator and purged 30 days after approval.</li>
  <li><strong>Public profile (shown anonymously in discovery):</strong> age, city, values, faith and family orientation, a short bio and a rotating public code (for example KD-XXXXXX). Never your name, photo, phone or Telegram identity.</li>
  <li><strong>Session and safety data:</strong> your validated Telegram identifier and authentication date (account security), one strictly-necessary session cookie, and PII-free operational and audit events.</li>
</ul>
<h2>3. What we never do</h2>
<ul>
  <li>No advertising, no third-party analytics, no trackers, no data brokers.</li>
  <li>No sale or rental of personal data, ever.</li>
  <li>Your Telegram name, username or contact list are not added to your profile.</li>
  <li>Declines and passes are silent: they are never surfaced to other members.</li>
</ul>
<h2>4. Legal basis and consent</h2>
<p>Religious belief and facial images are sensitive personal data under Proclamation 1321/2024. We process them only on the basis of your explicit, recorded consent: the onboarding flow presents separate consent toggles and stores a consent receipt before any submission is possible. You may withdraw consent at any time by deleting your account, which erases the vault.</p>
<h2>5. Your rights</h2>
<p>You hold the rights granted by Proclamation 1321/2024, including access, rectification, erasure, restriction of processing and objection to automated decision-making. The in-app <strong>Privacy &amp; data rights</strong> screen gives you self-serve <strong>export</strong> (a JSON bundle of your data) and <strong>delete</strong> (erasure of the vault and profile) actions, and the pilot administrator can assist with any other request through the official Telegram bot.</p>
<h2>6. Where data lives</h2>
<p>Production personal data is stored on servers located in Ethiopia, as required by the data-sovereignty provisions of Proclamation 1321/2024. Sensitive personal data is not transferred across borders without the prior approval of the supervisory authority.</p>
<h2>7. Cookies</h2>
<p>We set a single strictly-necessary session cookie (HttpOnly, SameSite=Strict, Secure in production) so you stay signed in. Because it is essential to the service you requested, no consent banner is required for it; consent for sensitive processing is captured in-app instead (section 4).</p>
<h2>8. Retention highlights</h2>
<ul>
  <li>Verification photo: administrator-only, purged 30 days after approval.</li>
  <li>Introduction requests: expire after 72 hours if unanswered.</li>
  <li>Sessions: expire after one hour of inactivity.</li>
  <li>Account deletion: erases the identity vault and profile data.</li>
</ul>
<h2>9. Security</h2>
<p>Identity fields are encrypted at rest with per-record bindings; administrators see codes, not names; review actions are audit-logged; introduction threads block phone numbers, handles and links until a separate, future consent step exists.</p>
<h2>10. Changes</h2>
<p>Material changes to this notice are announced in-app before they take effect. The date below is the current version.</p>
<p class="note">Version: pilot edition, September 2026. Questions or rights requests: use the in-app Privacy &amp; data rights screen, or contact the pilot administrator via the official Kidan Telegram bot.</p>
`;

const TERMS_BODY = `
<h2>1. Agreement</h2>
<p>These terms govern your use of the Kidan pilot service (the "Service"), a Telegram Mini App for intentional, values-first introductions between marriage-minded adults. By submitting a profile you accept these terms.</p>
<h2>2. Eligibility</h2>
<ul>
  <li>You are an adult within the pilot age band and legally able to marry.</li>
  <li>You participate as yourself: one person, one Telegram account, one profile.</li>
  <li>Your private identity information (legal name, phone, date of birth, verification photo) must be truthful and current.</li>
  <li>You join voluntarily and understand the Service is operated as a pilot programme.</li>
</ul>
<h2>3. How introductions work</h2>
<p>Discovery shows anonymous, values-only cards. A right-swipe is a private shortlist signal and notifies no one. An introduction request is a deliberate step (limited per day, expiring after 72 hours). A connection exists only when a request is accepted, both people confirm, and an administrator approves. Declines are silent everywhere.</p>
<h2>4. Conduct</h2>
<ul>
  <li>Keep introduction threads within Kidan: phone numbers, Telegram handles and links are blocked by design and must not be circumvented.</li>
  <li>No harassment, pressure, misrepresentation, scraping, automation or commercial solicitation.</li>
  <li>Closing a pairing is always permitted and must be done respectfully through the provided flow.</li>
  <li>Meeting in person is your decision; we encourage community norms (public places, involving trusted family or parish members where customary).</li>
</ul>
<h2>5. Review and moderation</h2>
<p>Every profile is privately verified and reviewed by an administrator before discovery. Approval, rejection and connection decisions rest with the operator. Rejections are private and are not disclosed to other members. We may suspend or close accounts that breach these terms or threaten safety, without prior notice where urgency requires.</p>
<h2>6. No promises of outcome</h2>
<p>The Service facilitates introductions only. We do not warrant matches, relationships or any particular outcome, and we are not a party to any relationship that follows.</p>
<h2>7. Your content and licence</h2>
<p>You keep ownership of what you write and upload. You grant us the limited licence needed to operate the Service (showing your public profile anonymously in discovery, your verification photo to reviewers). Your private vault is never licensed publicly.</p>
<h2>8. Ending your participation</h2>
<p>You may delete your account at any time from the in-app Privacy &amp; data rights screen; this erases your identity vault and profile. Sections 3-6 survive termination where they logically must.</p>
<h2>9. Pilot status and changes</h2>
<p>The Service is provided as a pilot, "as is", while the community and safeguards mature. We may change features or these terms; material changes are announced in-app before taking effect.</p>
<h2>10. Governing law</h2>
<p>These terms are governed by the laws of the Federal Democratic Republic of Ethiopia, including Proclamation No. 1321/2024 for all data-protection matters.</p>
<p class="note">Version: pilot edition, September 2026. Questions: contact the pilot administrator via the official Kidan Telegram bot.</p>
`;

const NOT_FOUND_BODY = `
<h2>Nothing here — and that is by design</h2>
<p>Kidan has no public web pages beyond its legal notices. Everything else lives inside the Telegram Mini App, behind your session and the review gate.</p>
<p class="note">If you were looking for the app, open Kidan from its official Telegram bot. For policy pages, see <a href="/privacy" style="color:#1f4b3c">/privacy</a> and <a href="/terms" style="color:#1f4b3c">/terms</a>.</p>
`;

export function publicPageHtml(page: "privacy" | "terms"): string {
  return page === "privacy"
    ? shell("Privacy notice", "Privacy & data rights", PRIVACY_BODY)
    : shell("Terms of use", "Terms & community covenant", TERMS_BODY);
}

export function notFoundPageHtml(): string {
  return shell("Page not found", "404", NOT_FOUND_BODY);
}

export function registerPublicPages(app: FastifyInstance): void {
  app.get("/privacy", async (_request, reply) =>
    reply.type("text/html; charset=utf-8").send(publicPageHtml("privacy")),
  );
  app.get("/terms", async (_request, reply) =>
    reply.type("text/html; charset=utf-8").send(publicPageHtml("terms")),
  );
  // The API origin exposes no indexable surface (legal pages carry a noindex
  // meta tag); answer crawler probes explicitly instead of leaking a 404 body.
  app.get("/robots.txt", async (_request, reply) =>
    reply.type("text/plain; charset=utf-8").send("User-agent: *\nDisallow: /\n"),
  );
}
