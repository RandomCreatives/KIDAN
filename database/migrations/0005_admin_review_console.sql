-- B3 (part 2): administrator review console support.
-- Depends on 0004 (the 'changes_requested' enum value is committed there).

-- Fixed pilot super-admin. The deterministic id keeps audit inserts stable and
-- avoids creating accounts at deploy time. Authentication is handled out-of-band
-- via the ADMIN_CONSOLE_PASSWORD secret, not this row.
INSERT INTO admin_account (id, display_label, role, active)
VALUES ('00000000-0000-4000-8000-0000000000a0', 'Pilot Administrator', 'super_admin', true)
ON CONFLICT (id) DO NOTHING;

-- Latest profile-review decision per candidate, with an optional encrypted
-- feedback note. The note may reference identity, so it is stored as app-layer
-- AES-256-GCM ciphertext like identity_vault rather than plaintext.
CREATE TABLE profile_review (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES admin_account(id),
  decision review_decision NOT NULL CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
  reason_code varchar(60),
  note_ciphertext bytea,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_review_decided ON profile_review(decided_at);

-- Each console decision also appends an immutable audit row to admin_review
-- (subject_type 'profile'); profile_review holds only the latest decision used
-- by the queue and candidate status views.

COMMENT ON TABLE profile_review IS 'Latest administrator profile-review decision per candidate; note_ciphertext is app-layer AES-256-GCM and may contain identity-referencing feedback.';
COMMENT ON COLUMN profile_review.note_ciphertext IS 'AES-256-GCM encrypted feedback; never used for discovery; shown only to the candidate and reviewers.';
