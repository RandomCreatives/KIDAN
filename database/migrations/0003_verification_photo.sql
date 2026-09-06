-- Phase 03 / B2: private administrator verification photo.
--
-- The candidate's verification photo is used ONLY for private identity
-- verification. It is never projected to discovery. It is stored encrypted
-- at the application layer (AES-256-GCM; see IdentityCipher.encryptBuffer) so
-- the database only ever holds ciphertext. It is scheduled for deletion 30
-- days after the profile is approved; the retention job wipes the ciphertext
-- in place (scheduled_delete_at) rather than just hiding it.

CREATE TABLE verification_photo (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  -- AES-256-GCM envelope: [version byte][12-byte IV][16-byte tag][ciphertext].
  photo_ciphertext bytea NOT NULL,
  media_type varchar(40) NOT NULL DEFAULT 'image/jpeg',
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  -- Set when the profile is approved; drives the 30-day deletion window.
  approved_at timestamptz,
  -- When set, the retention job has wiped photo_ciphertext.
  deleted_at timestamptz
);

-- Retention job lookup: approved photos whose 30-day window has elapsed and
-- which have not yet been wiped.
CREATE INDEX idx_verification_photo_due
  ON verification_photo(approved_at)
  WHERE deleted_at IS NULL AND approved_at IS NOT NULL;

COMMENT ON TABLE verification_photo IS 'Admin-only verification photos, encrypted at the application layer; never used in discovery. Ciphertext is purged 30 days after approval.';
COMMENT ON COLUMN verification_photo.photo_ciphertext IS 'AES-256-GCM encrypted photo bytes; decrypted only for private administrator verification.';
