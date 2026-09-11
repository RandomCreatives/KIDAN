# Kidan Completion — Product Spec v1

Status: BUILD APPROVED (2026-09-11). All design decisions locked.
Tone placeholder: minimal; final wording passes later (owner decision pending).

## 1. Definition of "Completion"

A pairing is **complete** when the couple either (a) meets in real life with
intent to continue ("Together"), or (b) parts properly through the app
("Decoupled"). The only *failure* state is silence: a match that neither goes
forward nor closes. The system's job: **make silence impossible to maintain.**

Lifecycle states:
```
matched → chatting → reveal_proposed → reveal_ready → revealed(courting)
    ├──────────────────────┬───────────────────────────────┤
    → decoupled (respectful exit, any stage)   → completed_together (+ follow-ups)
```
Parallel flags: `stalled`, `closing_requested`.

## 2. Design Decisions (locked by owner, 2026-09-11)

1. **Reveal payload: full name + phone number.** (No govt ID / KYC step.)
2. **Reveal gate: 7 days AND 20 exchanged messages COMBINED** — BOTH
   required; unlocking the repeating "Are you ready?" loop (owner model:
   both-no = chat continues; no forced verdict).
3. **Post-reveal: Kidan is a bridge.** They date externally; the app tracks
   outcome, nudges the proper date, hands off gracefully. It does not try to
   own the courtship ("just dating" — confirm interpretation).
4. **Serial-dater defense: reminder, THEN block.** Stale un-closed pairing
   gets gentle reminders; then new matches hard-block until the open path is
   continued or closed properly.
5. **Closing: quick/clean + follow-up popup check** a few days later.

## 3. The Reveal Readiness Loop (mutual "Are you ready?" - owner model)

Gate: pairing age >= 7 days AND >= 20 messages combined.
The gate does NOT force a decision - it opens a repeating readiness question.

- **Prompt:** once the gate is met, a periodic (~ every 7 days) bot/in-app
  prompt asks BOTH: "Are you ready for the next step?" Plus a persistent
  soft "Next step" button in the chat view (either party, anytime post-gate).
- **Both say no / not yet** -> chat continues, warm state kept, no penalty,
  no pressure copy; the question re-asks on the next cycle. An answered
  "not yet" resets the stall clock - the hard-gate/block rule (sect 5)
  applies to SILENCE, never to an honest "not yet".
- **One yes, one no** -> the no-side receives ONE gentle note: "K-XXXX is
  ready when you are." Chat continues; no repeated nagging; the proposal
  state expires in 7 days with a grace note on both sides.
- **Both yes** -> primer screen (safety/dating wisdom: meet publicly, tell
  someone you trust; advisor/chaperone invite = v2 slot) -> simultaneous
  confirm -> single server transaction flips both sides; full name + phone
  appear on both sides at the same moment. State -> courting.
- **Zombie-match guard:** after 3-4 consecutive mutual "not yet" cycles
  (~ one month) the loop swaps to reflection: "You've walked with K-XXXX a
  month - continue, or close properly? Both are honorable roads." Open
  paths must be alive or cleanly ended - never abandoned, never endless.

## 4. Check-in Pulses (bot, inline buttons, codes only)

Cadence: first pulse day +3 after match, then every 7 days while the pairing
is in `chatting` or `courting`. Stops at Together / Decoupled.

Chatting prompt:
> "How are things with candidate K-XXXX?"
> 🌱 Going well · 🐢 Slow, still interested · 🍂 We've drifted ·
> 🕊️ Prefer to part properly · 🆘 Need guidance

Courting prompt:
> "How is your journey with K-XXXX since you connected?"
> 🌱 Well, moving forward · 📅 Planning a proper date · 🐢 Slow ·
> 🍂 Drifting · 🕊️ Parting properly · 🆘 Need guidance

Actions:
- 🌱 positive ×N in a row → offer the reveal handshake ("You both sound
  ready…") / after reveal: nudge the proper date.
- 🍂 / 🕊️ → closing ceremony (§6). 🆘 → routes to admin inbox / Report a
  concern (existing path).
- **Two consecutive ignored pulses by one side** → other side privately asked
  "Still waiting on K-XXXX?" → can close cleanly or keep waiting. Pairing
  flagged `stalled`.

## 5. Serial-dater Rule (reminder → block)

- `stalled` = no messages 7+ days AND ignored latest pulse.
- Day 3 stale: gentle reminder in chat + bot ("You have an open path with
  K-XXXX — continue it or close it properly, both are honorable.")
- Day 7 stale: **hard gate** — cannot pick/choose new candidates while an
  un-closed silent pairing exists. Block screen offers two one-tap paths:
  "Send a message" / "Close respectfully". Honored per decision #4.
- Behavioral abuse patterns (reveal-then-vanish serially) surface in admin
  events table for operator judgement — never auto-shame.

## 6. Closing Ceremony (clean + follow-up popup)

- One side may close at ANY stage: single tap → confirm → done. The other
  receives a dignified notification: "K-XXXX has chosen to close this path
  respectfully. Every path on Kidan ends well or goes forward."
- Optional private reason (preset list), never shown to the other party;
  aggregate-only in operator stats. Pool reopens immediately.
- **Follow-up popup ~3 days later** (both sides, codes only):
  "How are you doing since your path with K-XXXX closed?"
  😊 Well · 🙏 Grateful for the clean ending · 💭 Want to share something
  (→ feedback → admin inbox + Report a concern).

## 7. Funnel & Operator Views

Events (funnel pipeline): matched, first_exchange, reveal_proposed,
revealed, rl_date_confirmed (self-report), completed_together, decoupled,
stalled_flagged, dater_blocked, pulse_answered(option), pulse_ignored.
Admin: pairings table (state, age, msgs, pulse responsivity, stalls),
closures and 🆘 land in admin inbox as required by standing constraint.

## 8. Implementation Sketch (next session, gated on owner GO)

- DB: `pairings` (state machine + counters + stalled flag), `pairing_events`,
  `pairing_pulses` (due/pending/answered). Daily cron (Hobby 1×/day) selects
  due pulses — weekly cadence fits constraint; two-run spacing risk noted.
- Bot: pulse senders + inline keyboard handlers (reuse existing button
  infra; no names/phones in bot text ever).
- Miniapp: reveal handshake card in chat, primer+confirm screens, reveal
  success screen (name+phone), stale block screen, closing follow-up popup.
- Copy: all strings = minimal placeholders pending owner wording pass.

## Open confirmations (remaining)
CONFIRMED: 20 msgs = combined total. Ready/no loop per sect 3.
STILL OPEN (2026-09-11 resolved): phone = registration phone (CONFIRMED).
Pulses continue weekly post-reveal until Together/Parted (CONFIRMED) and are
delivered via BOT check-ins (CONFIRMED owner choice). Together = self-report
(assumed). "just dating"/bridge reading assumed correct. BUILD APPROVED.

## 9. Ops (shipped)

- **Scheduler:** single daily Vercel cron `GET /internal/completion/tick`
  (06:00, in `apps/api/vercel.json`; POST also accepted for manual runs),
  bearer-gated by `COMPLETION_CRON_SECRET` (set `CRON_SECRET` to the same
  value for Vercel Cron auth). One tick computes ALL due dispatches: readiness
  re-asks, weekly check-in pulses, stall reminder/block, closing follow-up —
  then drains the pending pulse queue to the candidate bot.
- **Exactly-once drains:** the +3d closing follow-up is claimed atomically
  (pg: `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)`; in-memory store:
  repo mutex), so overlapping/manual runs can never double-send. Covered by
  `apps/api/test/integration/pgCompletionDrain.test.ts` (claim-once under
  concurrent ticks, due-order + batch limit).
- **Bot bridge:** inline buttons carry `pair:<pulseId>:<answer>`; the bot
  forwards to `POST /internal/pairing/answer` (existing `BOT_API_URL` +
  `BOT_STATE_SECRET`, no new bot secrets) and replaces the message with the
  API's privacy-safe acknowledgement. 409 (already answered) gets a friendly
  static ack; any failure asks the user to answer again inside the miniapp.
- **Caveat (accepted):** weekly cadence pulse insertion is service-enforced
  ("one open pulse per kind per side"); two overlapping ticks could in theory
  both see no open pulse and both insert. Single daily cron makes this a
  non-issue in practice; do not schedule the tick more often without adding a
  unique constraint or claim for cadence pulses.
