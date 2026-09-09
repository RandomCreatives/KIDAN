-- Feedback / comments / concerns from candidates to the operator.
--
-- Stores the user's own words for support and triage. Free text from the
-- user; content-length bounds are enforced at the service layer and the body
-- is never logged in full. `public_code` is recorded as a denormalised copy so
-- the operator console can list feedback with a public-code label without a
-- join, and it is the only candidate identifier surfaced.
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  public_code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('report', 'feedback', 'comment')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_unread ON feedback(created_at DESC) WHERE read_at IS NULL;
