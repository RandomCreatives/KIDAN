-- Persistence foundation for opaque app sessions and canonical marriage-intention values.
-- Tokens and Telegram identifiers are never stored in plaintext.

CREATE TABLE app_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  session_token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX idx_app_session_user_active ON app_session(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_app_session_token_active ON app_session(session_token_hash) WHERE revoked_at IS NULL;

ALTER TABLE discovery_profile
  ADD CONSTRAINT discovery_profile_marriage_intention_canonical
    CHECK (
      marriage_intention IS NULL OR marriage_intention IN (
        'teklil',
        'kidusan_kurban',
        'orthodox_church_marriage'
      )
    );

ALTER TABLE partner_preference
  ADD CONSTRAINT partner_preference_accepted_marriage_intentions_array
    CHECK (jsonb_typeof(accepted_marriage_intentions_json) = 'array'),
  ADD CONSTRAINT partner_preference_accepted_marriage_intentions_canonical
    CHECK (
      NOT jsonb_path_exists(
        accepted_marriage_intentions_json,
        '$[*] ? (@ != "teklil" && @ != "kidusan_kurban" && @ != "orthodox_church_marriage")'
      )
    );

COMMENT ON TABLE app_session IS 'Opaque application sessions. Store only keyed hashes of client tokens.';
COMMENT ON COLUMN app_session.session_token_hash IS 'HMAC-SHA-256 of the session token with an application pepper; never store raw tokens.';
COMMENT ON CONSTRAINT discovery_profile_marriage_intention_canonical ON discovery_profile IS 'Use kidusan_kurban as the canonical storage value; do not store ambiguous kurban.';
