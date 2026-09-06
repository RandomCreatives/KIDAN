-- ============================================================================
-- PRE-PILOT TEST-DATA RESET  (A5)
-- ============================================================================
--
-- WARNING: THIS SCRIPT DELETES *ALL* CANDIDATE / USER DATA.
--
-- Run this EXACTLY ONCE, before the controlled pilot begins, to clear every
-- account created during construction and testing — including the inert
-- synthetic users made by automated auth-signature probes and any manual
-- walkthrough accounts. After the pilot has real candidates this MUST NOT be
-- run again; use scoped, logged deletions instead (data export/delete, B6).
--
-- What it does:
--   * Removes every app_user and all dependent rows (sessions, drafts,
--     discovery profiles, preferences, consents, decisions, connections,
--     confirmations, blocks, reports, audit events, identity vault data).
--   * CASCADE + RESTART IDENTITY clears child tables and resets any sequences.
--   * PRESERVES schema_migration (so the schema version history is kept) and
--     admin_account (administrator identities are operator data, not candidate
--     test data). admin_review rows reference candidate users and are removed
--     by the cascade.
--
-- Telegram identifiers in identity_vault are stored encrypted (ciphertext +
-- keyed lookup hash), so there is no safe plaintext key to target only the
-- three probe rows; hence a full pre-pilot reset is the correct operation
-- while all rows are still test data.
--
-- HOW TO RUN (operator, from a machine with the staging DATABASE_URL):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f pre_pilot_test_data_reset.sql
--
-- It runs inside a transaction; it only commits if every statement succeeds.
-- ============================================================================

BEGIN;

-- Safety net: refuse to run against an empty/unknown database that lacks the
-- expected user table, to avoid silently doing nothing against the wrong DB.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_user'
  ) THEN
    RAISE EXCEPTION 'app_user table not found — aborting (wrong database?)';
  END IF;
END $$;

TRUNCATE TABLE
  audit_event,
  safety_report,
  user_block,
  admin_review,
  connection_confirmation,
  connection,
  discovery_decision,
  consent_receipt,
  partner_preference,
  discovery_profile,
  onboarding_draft,
  app_session,
  identity_vault,
  app_user
  RESTART IDENTITY CASCADE;

COMMIT;

-- Verification (run after committing; expect 0 for each):
--   SELECT count(*) FROM app_user;
--   SELECT count(*) FROM app_session;
--   SELECT count(*) FROM onboarding_draft;
-- Migrations must still be recorded (expect the full applied list):
--   SELECT name FROM schema_migration ORDER BY name;
