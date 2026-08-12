ALTER TABLE discovery_profile
  ALTER COLUMN wants_children TYPE varchar(24)
  USING CASE
    WHEN wants_children IS TRUE THEN 'yes'
    WHEN wants_children IS FALSE THEN 'no'
    ELSE NULL
  END;
ALTER TABLE discovery_profile
  ADD CONSTRAINT discovery_profile_wants_children_check
  CHECK (wants_children IN ('yes', 'no', 'open_to_discussion'));

CREATE TABLE app_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  csrf_token_hash bytea NOT NULL CHECK (octet_length(csrf_token_hash) = 32),
  telegram_auth_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE TABLE onboarding_draft (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  schema_version varchar(32) NOT NULL,
  current_step varchar(40) NOT NULL,
  public_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);

CREATE INDEX idx_session_user_active
  ON app_session(user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_session_expiry
  ON app_session(expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_draft_unsubmitted
  ON onboarding_draft(updated_at)
  WHERE submitted_at IS NULL;

COMMENT ON COLUMN app_session.token_hash IS 'HMAC-SHA-256 of a high-entropy opaque session token; never store the raw token.';
COMMENT ON COLUMN app_session.csrf_token_hash IS 'HMAC-SHA-256 of the CSRF token returned only to the authenticated Mini App.';
COMMENT ON COLUMN onboarding_draft.public_payload_json IS 'Onboarding eligibility, public profile, faith/family, and matching preferences only. Identity-vault fields are forbidden.';
