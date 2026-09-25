-- Public "Report a concern" submissions from the standalone info site.
--
-- The info hub (apps/info) lets anyone — including people without an account —
-- report a safety/privacy concern straight to the operator console. Those rows
-- live in the same feedback table so the existing admin triage surface keeps
-- working unchanged. Web submissions have no app_user behind them, hence:
--   • user_id becomes nullable (source='web' rows carry NULL),
--   • source distinguishes 'app' (in-app, authenticated) from 'web' (public),
--   • topic is the web form's dropdown category,
--   • contact is the optional reply channel the reporter volunteers.
-- Detached rows intentionally get public_code 'WEB' — the public code field
-- stays NOT NULL so the admin console's labelling keeps working.

ALTER TABLE feedback ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS topic text NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS contact text NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_source_check') THEN
    ALTER TABLE feedback ADD CONSTRAINT feedback_source_check CHECK (source IN ('app', 'web'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_topic_check') THEN
    ALTER TABLE feedback ADD CONSTRAINT feedback_topic_check
      CHECK (topic IS NULL OR topic IN ('profile_or_behavior', 'privacy', 'technical', 'question', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_contact_len') THEN
    ALTER TABLE feedback ADD CONSTRAINT feedback_contact_len
      CHECK (contact IS NULL OR char_length(contact) BETWEEN 1 AND 200);
  END IF;
END $$;
