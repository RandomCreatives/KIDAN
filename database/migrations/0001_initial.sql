-- Kidan initial privacy-oriented domain schema.
-- Sensitive identity fields are ciphertext only; key management stays outside PostgreSQL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM (
  'new', 'identity_pending', 'profile_pending', 'active', 'paused', 'suspended', 'deleted'
);
CREATE TYPE connection_status AS ENUM (
  'mutual_pending_admin', 'admin_rejected', 'admin_approved_pending_confirmation',
  'connected', 'declined', 'blocked', 'closed'
);
CREATE TYPE review_decision AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_code varchar(9) NOT NULL UNIQUE CHECK (public_code ~ '^KD-[2-9A-HJ-NP-Z]{6}$'),
  status user_status NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE identity_vault (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  telegram_id_ciphertext bytea NOT NULL,
  telegram_id_lookup_hash bytea NOT NULL UNIQUE,
  legal_name_ciphertext bytea,
  phone_ciphertext bytea,
  phone_lookup_hash bytea UNIQUE,
  date_of_birth_ciphertext bytea,
  phone_verified_at timestamptz,
  adult_verified_at timestamptz,
  verification_status review_decision NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discovery_profile (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  gender varchar(16) NOT NULL CHECK (gender IN ('female', 'male')),
  city_code varchar(40) NOT NULL,
  education_level varchar(60),
  field_of_study varchar(80),
  employment_status varchar(40),
  occupation_category varchar(80),
  height_cm smallint CHECK (height_cm BETWEEN 120 AND 230),
  marital_status varchar(40),
  has_children boolean,
  wants_children boolean,
  faith_tradition varchar(80) NOT NULL DEFAULT 'ethiopian_orthodox_tewahedo',
  marriage_intention varchar(40),
  values_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  bio varchar(280),
  photo_mode varchar(30) NOT NULL DEFAULT 'values_only',
  review_status review_decision NOT NULL DEFAULT 'pending',
  profile_version integer NOT NULL DEFAULT 1 CHECK (profile_version > 0),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE partner_preference (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  age_min smallint NOT NULL CHECK (age_min >= 18),
  age_max smallint NOT NULL CHECK (age_max <= 90 AND age_max >= age_min),
  city_codes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_to_abroad boolean NOT NULL DEFAULT false,
  accepted_marital_statuses_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepts_partner_with_children boolean,
  desired_values_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepted_marriage_intentions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  additional_preferences varchar(500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  purpose varchar(80) NOT NULL,
  policy_version varchar(32) NOT NULL,
  granted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  UNIQUE (user_id, purpose, policy_version, recorded_at)
);

CREATE TABLE discovery_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  decision varchar(16) NOT NULL CHECK (decision IN ('pass', 'interested')),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_user_id <> target_user_id),
  UNIQUE (actor_user_id, target_user_id),
  UNIQUE (actor_user_id, idempotency_key)
);

CREATE TABLE connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status connection_status NOT NULL DEFAULT 'mutual_pending_admin',
  admin_approved_at timestamptz,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a_id <> user_b_id),
  CHECK (user_a_id::text < user_b_id::text),
  UNIQUE (user_a_id, user_b_id)
);

CREATE TABLE connection_confirmation (
  connection_id uuid NOT NULL REFERENCES connection(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  confirmed boolean NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, user_id)
);

CREATE TABLE admin_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_label varchar(80) NOT NULL,
  role varchar(40) NOT NULL CHECK (role IN ('identity_reviewer', 'profile_reviewer', 'match_reviewer', 'safety_admin', 'super_admin')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_account(id),
  subject_type varchar(30) NOT NULL CHECK (subject_type IN ('identity', 'profile', 'connection', 'report')),
  subject_id uuid NOT NULL,
  decision review_decision NOT NULL,
  reason_code varchar(60),
  note_ciphertext bytea,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_block (
  blocker_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (blocker_user_id <> blocked_user_id),
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);

CREATE TABLE safety_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES connection(id) ON DELETE SET NULL,
  reason_code varchar(60) NOT NULL,
  detail_ciphertext bytea,
  status varchar(30) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (reporter_user_id <> reported_user_id)
);

CREATE TABLE audit_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type varchar(20) NOT NULL CHECK (actor_type IN ('user', 'admin', 'service')),
  actor_id uuid,
  action varchar(80) NOT NULL,
  subject_type varchar(40),
  subject_id uuid,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_user_active ON app_user(status) WHERE status = 'active';
CREATE INDEX idx_profile_discovery ON discovery_profile(gender, city_code) WHERE review_status = 'approved';
CREATE INDEX idx_decision_target ON discovery_decision(target_user_id, decision);
CREATE INDEX idx_connection_status ON connection(status, updated_at);
CREATE INDEX idx_report_open ON safety_report(status, created_at) WHERE status = 'open';
CREATE INDEX idx_audit_subject ON audit_event(subject_type, subject_id, occurred_at);

COMMENT ON TABLE identity_vault IS 'Encrypted identity data. Never join into ordinary discovery queries.';
COMMENT ON TABLE audit_event IS 'Append-only security audit. metadata_json must not contain identity or message content.';
