-- Track: Kidan Completion (post-chat journey) — v1 core.
--
-- A pairing "journey" starts when a connection reaches 'connected' (both
-- sides confirmed after admin approval). The journey models everything the
-- spec docs/KIDAN_COMPLETION.md defines AFTER that point: the reveal
-- readiness loop (7 days AND 20 combined messages gate -> mutual "Are you
-- ready?" -> simultaneous confirm -> name+phone reveal), decoupling with
-- dignity, stall detection (serial-dater counter), and completion events
-- feeding the operator funnel.
--
-- Deliberately separate from connection.status: the connection row keeps
-- governing the match existence ('connected' / 'closed'); the journey row
-- governs the post-match narrative. Closing a journey also closes the
-- connection (application layer), never the other way around.

CREATE TYPE pairing_stage AS ENUM (
  'chatting',            -- connected, pre-reveal; readiness loop once gate met
  'revealed',            -- name+phone unveiled simultaneously; courting
  'completed_together',  -- pair reports walking forward with intent (v1 self-report)
  'decoupled'            -- path closed properly (any stage)
);

CREATE TABLE pairing_journey (
  connection_id uuid PRIMARY KEY REFERENCES connection(id) ON DELETE CASCADE,
  user_a_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  stage pairing_stage NOT NULL DEFAULT 'chatting',

  -- counters / gate milestones (gate: age >= 7 days AND exchange_count >= 20)
  matched_at timestamptz NOT NULL,
  exchange_count integer NOT NULL DEFAULT 0 CHECK (exchange_count >= 0),
  last_message_at timestamptz,
  reveal_gate_unlocked_at timestamptz,

  -- readiness loop ("Are you ready?" asks BOTH; both-no = continue)
  last_ready_prompt_at timestamptz,
  reveal_ready_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL, -- one-sided "yes, waiting"
  reveal_ready_at timestamptz,
  not_yet_cycle_count integer NOT NULL DEFAULT 0 CHECK (not_yet_cycle_count >= 0),

  -- primer -> simultaneous confirm -> reveal execution
  primer_confirmed_a boolean NOT NULL DEFAULT false,
  primer_confirmed_b boolean NOT NULL DEFAULT false,
  revealed_at timestamptz,

  -- stall machinery (serial-dater counter: reminder -> hard block)
  last_active_at_a timestamptz NOT NULL,
  last_active_at_b timestamptz NOT NULL,
  stall_remind_due_at timestamptz,
  stall_blocked_at timestamptz,

  -- decoupling (clean) + follow-up check (+ ~3 days, both sides)
  decoupled_at timestamptz,
  decoupled_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  decouple_reason varchar(60),
  closing_followup_due_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pairing_journey_active ON pairing_journey(stage) WHERE stage IN ('chatting', 'revealed');
CREATE INDEX idx_pairing_journey_member_a ON pairing_journey(user_a_id) WHERE stage IN ('chatting', 'revealed');
CREATE INDEX idx_pairing_journey_member_b ON pairing_journey(user_b_id) WHERE stage IN ('chatting', 'revealed');

-- Scheduled, answerable check-ins per side (bot-delivered, codes only).
CREATE TYPE pairing_pulse_kind AS ENUM (
  'check_in',          -- day +3, then weekly while chatting/revealed
  'readiness',         -- the reveal loop prompt itself ("Are you ready?")
  'stall_probe',       -- "still waiting on K-XXXX?" to the non-silent side
  'closing_followup'   -- "+3 days after close: how are you doing?"
);

CREATE TABLE pairing_pulse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES pairing_journey(connection_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind pairing_pulse_kind NOT NULL,
  due_at timestamptz NOT NULL,          -- scheduler creates when due_at <= now
  sent_at timestamptz,                  -- bot dispatch (phase 2)
  answered_at timestamptz,
  answer varchar(40),                   -- going_well | slow | drifted | part | guidance | ready | not_yet | well_after_close | grateful | share_feedback
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Per side, at most one OPEN pulse per kind at a time: enforced by the
-- service with the journey row lock (a partial-unique index cannot express
-- "unanswered" portably here).
CREATE INDEX idx_pairing_pulse_pending_send ON pairing_pulse(sent_at) WHERE sent_at IS NULL;
CREATE INDEX idx_pairing_pulse_side ON pairing_pulse(connection_id, user_id, answered_at, created_at);

-- Funnel/audit feed (operator view + aggregate stats).
CREATE TABLE pairing_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES pairing_journey(connection_id) ON DELETE CASCADE,
  kind varchar(40) NOT NULL,            -- matched | gate_unlocked | ready_yes | ready_not_yet | both_ready | revealed |
                                        -- decoupled | stalled | pulse_answered | guidance_requested |
                                        -- stall_reminded | stall_blocked | rl_date_confirmed | completed_together
  actor_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pairing_event_connection ON pairing_event(connection_id, created_at);
CREATE INDEX idx_pairing_event_recent ON pairing_event(created_at);
