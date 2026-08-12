# Source Questionnaire Analysis

Date reviewed: 2026-08-12
Source handling: four temporary screenshots were used for product analysis and then deleted. No screenshot or raw source upload belongs in the repository or application.

## Executive interpretation

The existing channel is a manual introduction service rather than an open dating chat. Its operating model is:

1. A candidate completes a Google Form.
2. The candidate currently pays an upfront 500 ETB fee.
3. The administrator reviews the submission and privately verifies the candidate.
4. The administrator assigns a gender-prefixed sequential code.
5. An anonymous text profile is published without the candidate's name or direct contact.
6. An interested person gives the administrator the profile code.
7. The administrator checks interest with the other candidate.
8. Contact is shared only if the interest is reciprocal.

This validates Kidan's core state machine: verified profile -> anonymous discovery -> independent mutual interest -> administrator review -> final confirmation -> controlled connection.

## Fields visible in the form

The Amharic wording below is interpreted from screenshots and needs native-language proofreading before it becomes production copy.

| Source question | Canonical meaning | Recommended Kidan treatment |
|---|---|---|
| ሙሉ ስም | Full name | Required, identity vault only, encrypted, never in discovery |
| ፆታ — ወንድ / ሴት | Gender | Structured eligibility/discovery field; policy must be explicit |
| ዕድሜ | Age | Replace with private date of birth and adult verification; derive public age |
| የሚኖሩበት ሀገር / ከተማ | Country/city of residence | Structured country and city; discovery receives coarse city only |
| የሥራ መስክ | Field of work | Split into employment status, occupation category, and sector; never employer name |
| የጋብቻ ሁኔታ … ልጅ | Marital and children status | Split into marital status, has children, wants children, and accepts partner with children |
| የጤንነት ሁኔታ | Health status | Exclude from discovery and matching; do not use vague “fully healthy” labels |
| የትምህርት ደረጃ | Education level | Structured level plus optional field of study |
| አካላዊ ገጽታ / ቁመት / የቆዳ ቀለም | Appearance, height, complexion | Height optional; exclude complexion and appearance ranking from MVP |
| የሚፈልጉት የትዳር አጋር መስፈርት | Desired partner requirements: age, residence, work, etc. | Split into reciprocal structured preferences; retain one moderated optional note |
| ጋብቻን … በምን አይነት ስርዓት | Intended church marriage ceremony | Structured enum after clergy/product terminology review |
| በቅዱስ ቁርባን / በተክሊል | Holy Communion/Kurban or Teklil | Faith-sensitive preference; clarify whether options are mutually exclusive |
| የትዳር አጋርን በተመለከተ የማይደራደሩበት ነገሮች | Partner non-negotiables | Optional moderated text with length limit; prohibit contacts, hate, and identifying details |
| ስልክ ቁጥር | Phone number | Identity vault only; independently verify; never send in bot messages |
| Candidate photo upload | Private visual verification | Admin-only private media; never part of discovery or contact reveal without a new, separate consent |

The product owner confirmed that the final upload is a candidate photo used for private verification. It is not a payment receipt and is not a discovery-profile photo. Store it in private media storage, never send it through the bot, and schedule deletion 30 days after profile approval.

## What the existing form does well

- Uses an anonymous public code instead of publishing names.
- Keeps contact behind an administrator-mediated process.
- Requires reciprocal interest before contact exchange.
- Collects marriage intention rather than encouraging casual unsolicited chat.
- Includes important family, faith, location, education, and employment context.
- Uses a private verification artifact rather than publishing it automatically.

## Problems to correct in Kidan

### One form mixes data with different trust levels
The source form places identity, public profile, sensitive faith/health information, preferences, phone, and verification media in one submission. Kidan must separate:

- identity-vault data,
- approved discovery data,
- matching preferences,
- consent receipts,
- safety/moderation data,
- private verification media.

### Too much required free text
Free text causes spelling variants, ambiguous responses, weak filtering, excessive moderator work, and accidental disclosure. Use structured controls first and a short optional note second.

### Age is stale and weak for adult verification
Collect date of birth privately, verify 18+ eligibility, and expose only a derived age. Never reveal the date of birth.

### Health is inappropriate as a broad public label
“Healthy” and “fully healthy” are ambiguous and sensitive. Health must not affect discovery ranking. Omit it from MVP. Any future disclosure must be specific, optional, consented, and available only in an appropriate connection context.

### Complexion should not become a ranking dimension
Do not add complexion filters, scoring, or attractiveness ranking. Height can be optional. If photos are introduced, they require a separate visibility and retention policy.

### Partner criteria need reciprocal structure
A person should see another profile only when both candidates' hard preferences are compatible. Age, location, marital/children status, marriage intention, and selected values should be separate fields. Occupation or education preferences should be optional rather than implied measures of worth.

### “Non-negotiables” need safeguards
Use value tags and explicit deal-breaker categories where possible. Optional prose should be short, reviewed, and stripped of phone numbers, usernames, exact addresses, exact workplaces, exact parishes, hate, harassment, and demeaning requirements.

### Consent and user rights are missing
Before collection, Kidan needs separate receipts for terms, private identity processing, faith data, discovery publication, verification media, bot notifications, and later contact disclosure. Users need pause, correction, withdrawal, export, and deletion controls.

## Recommended onboarding

### 1. Welcome and eligibility
- 18+ requirement
- Ethiopian Orthodox Tewahedo Church eligibility for the first release
- Serious marriage intention
- Community rules and privacy summary

### 2. Secure Telegram authentication
- Validate raw Telegram init data on the API
- Create an opaque application session
- Ignore Telegram public name/username for discovery

### 3. Private identity
Marked clearly as **Admin only**:
- Full legal/verified name
- Date of birth
- Phone and OTP/contact verification
- Private verification photo or other approved evidence
- Separate evidence-retention consent

### 4. Public profile
Show a live “what others will see” preview:
- Random neutral public code
- Derived age
- Coarse city
- Broad education and occupation categories
- Marital and children status chosen for display
- Optional height
- Marriage intention
- Selected values and short biography

### 5. Faith and family intention
- Orthodox tradition/jurisdiction
- Church-marriage intention and terminology-approved options
- Importance of faith in family life
- Future children/family intention
- Values, without a spiritual-worth score

### 6. Partner preferences
- Age range
- Accepted cities/countries and relocation openness
- Marital/children compatibility
- Marriage-ceremony intention
- Desired values
- Optional employment/education preferences
- Short moderated additional note

### 7. Public preview and submission
The candidate sees the exact discovery projection. Identity fields, phone, verification media, and reports must never appear in this preview.

### 8. Consent and review
Separate active choices for each purpose, then profile enters `profile_pending`. Rejected or edited profiles have a clear correction/appeal path.

## Payment idea — backlog only

MVP remains free. A possible later model is a 100 ETB connection-facilitation fee when users accept a real connection and want to proceed. It is not part of current implementation.

If explored later, the fairest state is:

`mutual interest -> admin approval -> both final confirmations -> payment authorization -> successful connection opening`

Requirements before implementation:

- Decide whether one or both candidates pay.
- Show price and refund conditions before final confirmation.
- If one side pays and the other does not complete, automatically refund or issue an immediately usable credit.
- Never charge to report, block, pause, delete, appeal, or access privacy rights.
- Do not reveal contact merely because one person paid.
- Keep payment records separate from profile and identity discovery data.
- Add payment disputes, receipts, reconciliation, fraud controls, and applicable tax/legal review.
- Avoid manipulative expiry timers and pay-to-rank mechanics.

## Confirmed product decisions

- First-release eligibility: adult Ethiopian Orthodox Tewahedo Church candidates only.
- Discovery: values-only, with no candidate photo.
- Verification-photo retention: delete 30 days after approval, subject only to a documented and audited exceptional hold.
- Connection opening: restricted in-app introduction first; names, phone numbers, Telegram usernames, and direct-message links remain hidden.
- Monetization: disabled for the free MVP; the 100 ETB idea remains backlog-only.

## Product decisions still required

1. Have a qualified native reviewer approve final Amharic copy and Orthodox ceremony terminology.
2. Define accepted marital-status, previous-marriage, and children-policy options.
3. Define what an in-app introduction may send, retain, report, and delete before building messaging.
4. Define the later dual-consent ceremony for optional name/contact exchange.
5. Approve verification-photo backup expiry and exceptional-hold procedure.
