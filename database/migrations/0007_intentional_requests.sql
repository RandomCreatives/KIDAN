-- Track D2: intentional introduction requests + pilot profile refinements.
--
-- 1) New faith/family basics on the (values-only) discovery profile.
--    has_godfather / church_service_active are shown on the summary; is_deacon
--    is asked of men (NULL = not applicable); has_disability is collected for
--    careful matching/admin awareness and is NEVER projected to other users
--    (matching-only), so it is stored on the encrypted-ish payload rather than
--    the discovery profile — see onboarding_draft JSON. We keep it here as a
--    non-projected boolean for admin visibility only.
ALTER TABLE discovery_profile
  ADD COLUMN IF NOT EXISTS has_godfather boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deacon boolean NULL,
  ADD COLUMN IF NOT EXISTS church_service_active boolean NOT NULL DEFAULT false;

-- 2) The intentional introduction request.
--    Swiping right only adds to a private shortlist (no table row). A formal
--    request is a committed act: rate-limited to 5 per rolling 24h per sender,
--    expires unanswered after 72 hours, and never notifies beyond the recipient
--    who must accept. Declines are invisible to the sender (they see 'pending'
--    until accepted or expired).
CREATE TYPE introduction_request_status AS ENUM (
  'pending', 'accepted', 'declined', 'expired'
);

CREATE TABLE introduction_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status introduction_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  responded_at timestamptz NULL,
  -- One live request per ordered (sender, recipient) pair.
  CONSTRAINT introduction_request_pair_uniq UNIQUE (sender_user_id, recipient_user_id),
  -- A request must be between two distinct people.
  CONSTRAINT introduction_request_distinct CHECK (sender_user_id <> recipient_user_id)
);

CREATE INDEX idx_intro_request_recipient ON introduction_request(recipient_user_id, status, created_at);
CREATE INDEX idx_intro_request_sender ON introduction_request(sender_user_id, created_at);
CREATE INDEX idx_intro_request_expiry ON introduction_request(expires_at) WHERE status = 'pending';

-- 3) Connection lifecycle for the request flow.
--    New pre-admin states: a request that is accepted becomes a connection
--    awaiting BOTH participants' confirmation; once both confirm it becomes
--    mutual_confirmed_pending_admin (the admin queue). Admin then approves →
--    connected (restricted chat), or rejects → admin_rejected.
ALTER TYPE connection_status ADD VALUE IF NOT EXISTS 'request_accepted_pending_confirmation';
ALTER TYPE connection_status ADD VALUE IF NOT EXISTS 'mutual_confirmed_pending_admin';
