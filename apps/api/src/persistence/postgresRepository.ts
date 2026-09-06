import type { Pool, PoolClient } from "pg";
import { publicOnboardingPayloadSchema } from "@kidan/contracts";
import { withTransaction } from "../database/pool.js";
import type {
  AdminDecisionInput,
  AdminQueueRow,
  AdminReviewAuditRow,
  AdminSubmissionRow,
  DraftRecord,
  IdentityUpdate,
  PersistenceRepository,
  SessionRecord,
  SubmissionConsent,
  SubmissionRecord,
  UserRecord,
  VerificationPhotoInput,
  VerificationPhotoRecord,
} from "./types.js";
import { SubmissionStateError, VersionConflictError } from "./types.js";

interface UserRow {
  id: string;
  public_code: string;
  status: UserRecord["status"];
}
interface DraftRow {
  user_id: string;
  schema_version: string;
  current_step: DraftRecord["currentStep"];
  public_payload_json: Record<string, unknown>;
  version: number;
  submitted_at: Date | null;
  updated_at: Date;
}

function mapUser(row: UserRow): UserRecord {
  return { id: row.id, publicCode: row.public_code, status: row.status };
}
function mapDraft(row: DraftRow): DraftRecord {
  return {
    userId: row.user_id,
    schemaVersion: row.schema_version,
    currentStep: row.current_step,
    publicPayload: row.public_payload_json,
    version: row.version,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class PostgresPersistenceRepository implements PersistenceRepository {
  constructor(private readonly pool: Pool) {}

  private async findUserByTelegramHash(hash: Buffer, client: Pool | PoolClient = this.pool): Promise<UserRecord | null> {
    const result = await client.query<UserRow>(`
      SELECT u.id, u.public_code, u.status
      FROM identity_vault i
      JOIN app_user u ON u.id = i.user_id
      WHERE i.telegram_id_lookup_hash = $1
    `, [hash]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findOrCreateUserByTelegram(input: {
    telegramLookupHash: Buffer;
    telegramCiphertext: Buffer;
    createPublicCode: () => string;
  }): Promise<UserRecord> {
    const existing = await this.findUserByTelegramHash(input.telegramLookupHash);
    if (existing) return existing;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        return await withTransaction(this.pool, async (client) => {
          const inserted = await client.query<UserRow>(
            "INSERT INTO app_user (public_code) VALUES ($1) RETURNING id, public_code, status",
            [input.createPublicCode()],
          );
          const row = inserted.rows[0];
          if (!row) throw new Error("USER_INSERT_FAILED");
          await client.query(`
            INSERT INTO identity_vault (
              user_id, telegram_id_ciphertext, telegram_id_lookup_hash
            ) VALUES ($1, $2, $3)
          `, [row.id, input.telegramCiphertext, input.telegramLookupHash]);
          return mapUser(row);
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const raced = await this.findUserByTelegramHash(input.telegramLookupHash);
        if (raced) return raced;
      }
    }
    throw new Error("PUBLIC_CODE_GENERATION_EXHAUSTED");
  }

  async createSession(input: {
    userId: string;
    tokenHash: Buffer;
    csrfTokenHash: Buffer;
    telegramAuthDate: Date;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(`
      INSERT INTO app_session (
        user_id, token_hash, csrf_token_hash, telegram_auth_date, expires_at
      ) VALUES ($1, $2, $3, $4, $5)
    `, [input.userId, input.tokenHash, input.csrfTokenHash, input.telegramAuthDate, input.expiresAt]);
  }

  async findActiveSession(tokenHash: Buffer, now: Date): Promise<SessionRecord | null> {
    const result = await this.pool.query<{
      session_id: string;
      csrf_token_hash: Buffer;
      expires_at: Date;
      revoked_at: Date | null;
      id: string;
      public_code: string;
      status: UserRecord["status"];
    }>(`
      SELECT s.id AS session_id, s.csrf_token_hash, s.expires_at, s.revoked_at,
             u.id, u.public_code, u.status
      FROM app_session s
      JOIN app_user u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2
      LIMIT 1
    `, [tokenHash, now]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.session_id,
      user: mapUser(row),
      csrfTokenHash: row.csrf_token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async revokeSession(tokenHash: Buffer, now: Date): Promise<void> {
    await this.pool.query(
      "UPDATE app_session SET revoked_at = COALESCE(revoked_at, $2) WHERE token_hash = $1",
      [tokenHash, now],
    );
  }

  async touchSession(sessionId: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE app_session
       SET last_seen_at = $2::timestamptz
       WHERE id = $1
         AND last_seen_at < ($2::timestamptz - interval '5 minutes')`,
      [sessionId, now],
    );
  }

  async getDraft(userId: string): Promise<DraftRecord | null> {
    const result = await this.pool.query<DraftRow>(`
      SELECT user_id, schema_version, current_step, public_payload_json,
             version, submitted_at, updated_at
      FROM onboarding_draft WHERE user_id = $1
    `, [userId]);
    return result.rows[0] ? mapDraft(result.rows[0]) : null;
  }

  async saveDraft(input: {
    userId: string;
    schemaVersion: string;
    currentStep: DraftRecord["currentStep"];
    publicPayload: Record<string, unknown>;
    expectedVersion: number;
    now: Date;
  }): Promise<DraftRecord> {
    let result;
    if (input.expectedVersion === 0) {
      result = await this.pool.query<DraftRow>(`
        INSERT INTO onboarding_draft (
          user_id, schema_version, current_step, public_payload_json, version, updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, 1, $5)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id, schema_version, current_step, public_payload_json,
                  version, submitted_at, updated_at
      `, [input.userId, input.schemaVersion, input.currentStep, JSON.stringify(input.publicPayload), input.now]);
    } else {
      result = await this.pool.query<DraftRow>(`
        UPDATE onboarding_draft
        SET schema_version = $2, current_step = $3, public_payload_json = $4::jsonb,
            version = version + 1, updated_at = $5
        WHERE user_id = $1 AND version = $6 AND submitted_at IS NULL
        RETURNING user_id, schema_version, current_step, public_payload_json,
                  version, submitted_at, updated_at
      `, [input.userId, input.schemaVersion, input.currentStep, JSON.stringify(input.publicPayload), input.now, input.expectedVersion]);
    }
    const row = result.rows[0];
    if (!row) throw new VersionConflictError();
    return mapDraft(row);
  }

  async savePrivateIdentity(userId: string, identity: IdentityUpdate, now: Date): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const result = await client.query(`
        UPDATE identity_vault
        SET legal_name_ciphertext = $2, phone_ciphertext = $3, phone_lookup_hash = $4,
            date_of_birth_ciphertext = $5, updated_at = $6
        WHERE user_id = $1
      `, [userId, identity.legalNameCiphertext, identity.phoneCiphertext, identity.phoneLookupHash, identity.dateOfBirthCiphertext, now]);
      if (result.rowCount !== 1) throw new Error("IDENTITY_NOT_FOUND");
      await client.query(
        "UPDATE app_user SET status = 'identity_pending', updated_at = $2 WHERE id = $1 AND status = 'new'",
        [userId, now],
      );
    });
  }

  async hasCompletePrivateIdentity(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ complete: boolean }>(`
      SELECT (
        legal_name_ciphertext IS NOT NULL AND phone_ciphertext IS NOT NULL
        AND phone_lookup_hash IS NOT NULL AND date_of_birth_ciphertext IS NOT NULL
      ) AS complete
      FROM identity_vault WHERE user_id = $1
    `, [userId]);
    return result.rows[0]?.complete === true;
  }

  async submitOnboarding(input: {
    userId: string;
    expectedVersion: number;
    consents: SubmissionConsent[];
    now: Date;
  }): Promise<SubmissionRecord> {
    return withTransaction(this.pool, async (client) => {
      const draftResult = await client.query<DraftRow>(`
        SELECT user_id, schema_version, current_step, public_payload_json,
               version, submitted_at, updated_at
        FROM onboarding_draft WHERE user_id = $1 FOR UPDATE
      `, [input.userId]);
      const row = draftResult.rows[0];
      if (!row) throw new SubmissionStateError("DRAFT_NOT_FOUND");
      if (row.submitted_at) throw new SubmissionStateError("DRAFT_ALREADY_SUBMITTED");
      if (row.version !== input.expectedVersion) throw new VersionConflictError();

      const identity = await client.query<{ complete: boolean }>(`
        SELECT (
          legal_name_ciphertext IS NOT NULL AND phone_ciphertext IS NOT NULL
          AND phone_lookup_hash IS NOT NULL AND date_of_birth_ciphertext IS NOT NULL
        ) AS complete
        FROM identity_vault WHERE user_id = $1
      `, [input.userId]);
      if (identity.rows[0]?.complete !== true) throw new SubmissionStateError("IDENTITY_INCOMPLETE");

      const payload = publicOnboardingPayloadSchema.parse(row.public_payload_json);
      const profile = payload.publicProfile;
      const faith = payload.faithAndFamily;
      const preferences = payload.partnerPreferences;

      await client.query(`
        INSERT INTO discovery_profile (
          user_id, gender, city_code, education_level, field_of_study,
          employment_status, occupation_category, height_cm, marital_status,
          has_children, wants_children, faith_tradition, marriage_intention,
          values_json, bio, photo_mode, review_status, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          'ethiopian_orthodox_tewahedo', $12, $13::jsonb, $14, 'values_only', 'pending', $15
        )
        ON CONFLICT (user_id) DO UPDATE SET
          gender = EXCLUDED.gender, city_code = EXCLUDED.city_code,
          education_level = EXCLUDED.education_level, field_of_study = EXCLUDED.field_of_study,
          employment_status = EXCLUDED.employment_status,
          occupation_category = EXCLUDED.occupation_category, height_cm = EXCLUDED.height_cm,
          marital_status = EXCLUDED.marital_status, has_children = EXCLUDED.has_children,
          wants_children = EXCLUDED.wants_children, marriage_intention = EXCLUDED.marriage_intention,
          values_json = EXCLUDED.values_json, bio = EXCLUDED.bio, review_status = 'pending',
          profile_version = discovery_profile.profile_version + 1, updated_at = EXCLUDED.updated_at
      `, [
        input.userId, profile.gender, profile.city, profile.educationLevel, profile.fieldOfStudy || null,
        profile.employmentStatus, profile.occupationCategory, profile.heightCm, profile.maritalStatus,
        profile.hasChildren, faith.wantsChildren, faith.marriageIntention,
        JSON.stringify(faith.values), faith.bio, input.now,
      ]);

      await client.query(`
        INSERT INTO partner_preference (
          user_id, age_min, age_max, city_codes_json, open_to_abroad,
          accepted_marital_statuses_json, accepts_partner_with_children,
          desired_values_json, accepted_marriage_intentions_json,
          additional_preferences, updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11)
        ON CONFLICT (user_id) DO UPDATE SET
          age_min = EXCLUDED.age_min, age_max = EXCLUDED.age_max,
          city_codes_json = EXCLUDED.city_codes_json, open_to_abroad = EXCLUDED.open_to_abroad,
          accepted_marital_statuses_json = EXCLUDED.accepted_marital_statuses_json,
          accepts_partner_with_children = EXCLUDED.accepts_partner_with_children,
          desired_values_json = EXCLUDED.desired_values_json,
          accepted_marriage_intentions_json = EXCLUDED.accepted_marriage_intentions_json,
          additional_preferences = EXCLUDED.additional_preferences, updated_at = EXCLUDED.updated_at
      `, [
        input.userId, preferences.ageMin, preferences.ageMax,
        JSON.stringify(preferences.preferredCities), preferences.openToAbroad,
        JSON.stringify(preferences.acceptedMaritalStatuses), preferences.acceptsPartnerWithChildren,
        JSON.stringify(preferences.desiredValues), JSON.stringify(preferences.acceptedMarriageIntentions),
        preferences.additionalPreferences || null, input.now,
      ]);

      for (const consent of input.consents) {
        await client.query(`
          INSERT INTO consent_receipt (user_id, purpose, policy_version, granted, recorded_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [input.userId, consent.purpose, consent.policyVersion, consent.granted, input.now]);
      }

      const updatedDraft = await client.query<DraftRow>(`
        UPDATE onboarding_draft
        SET current_step = 'submitted', submitted_at = $2, updated_at = $2, version = version + 1
        WHERE user_id = $1
        RETURNING user_id, schema_version, current_step, public_payload_json,
                  version, submitted_at, updated_at
      `, [input.userId, input.now]);
      await client.query(
        "UPDATE app_user SET status = 'profile_pending', updated_at = $2 WHERE id = $1",
        [input.userId, input.now],
      );

      return { draft: mapDraft(updatedDraft.rows[0]!), consents: input.consents };
    });
  }

  async saveVerificationPhoto(userId: string, input: VerificationPhotoInput): Promise<void> {
    await this.pool.query(`
      INSERT INTO verification_photo (user_id, photo_ciphertext, media_type, sha256, uploaded_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        photo_ciphertext = EXCLUDED.photo_ciphertext,
        media_type = EXCLUDED.media_type,
        sha256 = EXCLUDED.sha256,
        uploaded_at = EXCLUDED.uploaded_at,
        approved_at = NULL,
        deleted_at = NULL
    `, [userId, input.photoCiphertext, input.mediaType, input.sha256, input.now]);
  }

  async hasVerificationPhoto(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ present: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM verification_photo WHERE user_id = $1 AND deleted_at IS NULL) AS present",
      [userId],
    );
    return result.rows[0]?.present === true;
  }

  async getVerificationPhoto(userId: string): Promise<VerificationPhotoRecord | null> {
    const result = await this.pool.query<{
      user_id: string;
      photo_ciphertext: Buffer;
      media_type: string;
      uploaded_at: Date;
      approved_at: Date | null;
      deleted_at: Date | null;
    }>(`
      SELECT user_id, photo_ciphertext, media_type, uploaded_at, approved_at, deleted_at
      FROM verification_photo WHERE user_id = $1 AND deleted_at IS NULL
    `, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      photoCiphertext: row.photo_ciphertext,
      mediaType: row.media_type,
      uploadedAt: row.uploaded_at,
      approvedAt: row.approved_at,
      deletedAt: row.deleted_at,
    };
  }

  async findVerificationPhotosDueForDeletion(now: Date, retentionDays: number): Promise<string[]> {
    const result = await this.pool.query<{ user_id: string }>(`
      SELECT user_id FROM verification_photo
      WHERE deleted_at IS NULL
        AND approved_at IS NOT NULL
        AND approved_at <= ($1::timestamptz - ($2 || ' days')::interval)
    `, [now.toISOString(), String(retentionDays)]);
    return result.rows.map((r) => r.user_id);
  }

  async deleteVerificationPhoto(userId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE verification_photo SET photo_ciphertext = ''::bytea, deleted_at = $2 WHERE user_id = $1 AND deleted_at IS NULL",
      [userId, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listPendingSubmissions(): Promise<AdminQueueRow[]> {
    const result = await this.pool.query<{
      user_id: string;
      public_code: string;
      gender: string;
      city: string;
      date_of_birth_ciphertext: Buffer;
      submitted_at: Date;
      review_status: string;
      has_photo: boolean;
    }>(`
      SELECT u.id AS user_id, u.public_code, p.gender, p.city_code AS city,
             v.date_of_birth_ciphertext, d.submitted_at,
             p.review_status::text AS review_status,
             (vp.user_id IS NOT NULL) AS has_photo
      FROM discovery_profile p
      JOIN app_user u ON u.id = p.user_id
      JOIN onboarding_draft d ON d.user_id = p.user_id
      JOIN identity_vault v ON v.user_id = p.user_id
      LEFT JOIN verification_photo vp ON vp.user_id = p.user_id AND vp.deleted_at IS NULL
      WHERE p.review_status = 'pending' AND d.submitted_at IS NOT NULL
      ORDER BY d.submitted_at DESC
    `);
    return result.rows.map((row) => ({
      userId: row.user_id,
      publicCode: row.public_code,
      gender: row.gender,
      city: row.city,
      dateOfBirthCiphertext: row.date_of_birth_ciphertext,
      submittedAt: row.submitted_at,
      reviewStatus: row.review_status,
      hasPhoto: row.has_photo,
    }));
  }

  async findUserIdByPublicCode(publicCode: string): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      "SELECT id FROM app_user WHERE public_code = $1",
      [publicCode],
    );
    return result.rows[0]?.id ?? null;
  }

  async getSubmissionForAdmin(userId: string): Promise<AdminSubmissionRow | null> {
    const result = await this.pool.query<{
      public_code: string;
      status: UserRecord["status"];
      submitted_at: Date;
      public_payload_json: Record<string, unknown>;
      legal_name_ciphertext: Buffer | null;
      phone_ciphertext: Buffer | null;
      date_of_birth_ciphertext: Buffer | null;
      has_photo: boolean;
      review_status: string;
    }>(`
      SELECT u.public_code, u.status, d.submitted_at, d.public_payload_json,
             v.legal_name_ciphertext, v.phone_ciphertext, v.date_of_birth_ciphertext,
             (vp.user_id IS NOT NULL) AS has_photo, p.review_status::text AS review_status
      FROM onboarding_draft d
      JOIN app_user u ON u.id = d.user_id
      JOIN identity_vault v ON v.user_id = d.user_id
      JOIN discovery_profile p ON p.user_id = d.user_id
      LEFT JOIN verification_photo vp ON vp.user_id = d.user_id AND vp.deleted_at IS NULL
      WHERE d.user_id = $1 AND d.submitted_at IS NOT NULL
    `, [userId]);
    const row = result.rows[0];
    if (!row) return null;

    const historyResult = await this.pool.query<AdminReviewAuditRow & {
      decision: string;
      reason_code: string | null;
      note_ciphertext: Buffer | null;
      created_at: Date;
    }>(`
      SELECT decision::text AS decision, reason_code, note_ciphertext, created_at
      FROM admin_review
      WHERE subject_type = 'profile' AND subject_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    const history: AdminReviewAuditRow[] = historyResult.rows.map((h) => ({
      decision: h.decision,
      reasonCode: h.reason_code,
      noteCiphertext: h.note_ciphertext,
      decidedAt: h.created_at,
    }));

    return {
      userId,
      publicCode: row.public_code,
      status: row.status,
      submittedAt: row.submitted_at,
      publicPayload: row.public_payload_json,
      legalNameCiphertext: row.legal_name_ciphertext,
      phoneCiphertext: row.phone_ciphertext,
      dateOfBirthCiphertext: row.date_of_birth_ciphertext,
      hasPhoto: row.has_photo,
      reviewStatus: row.review_status,
      history,
    };
  }

  async recordAdminDecision(input: AdminDecisionInput): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      // Append the immutable audit row.
      await client.query(`
        INSERT INTO admin_review (admin_id, subject_type, subject_id, decision, reason_code, note_ciphertext)
        VALUES ($1, 'profile', $2, $3::review_decision, $4, $5)
      `, [input.adminId, input.userId, input.decision, input.reasonCode, input.noteCiphertext]);

      // Upsert the latest-decision row used by queue/status views.
      await client.query(`
        INSERT INTO profile_review (user_id, admin_id, decision, reason_code, note_ciphertext, decided_at)
        VALUES ($1, $2, $3::review_decision, $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE SET
          admin_id = EXCLUDED.admin_id,
          decision = EXCLUDED.decision,
          reason_code = EXCLUDED.reason_code,
          note_ciphertext = EXCLUDED.note_ciphertext,
          decided_at = EXCLUDED.decided_at
      `, [input.userId, input.adminId, input.decision, input.reasonCode, input.noteCiphertext, input.now]);

      // Update the discovery profile review status.
      await client.query(
        "UPDATE discovery_profile SET review_status = $2::review_decision, reviewed_at = $3, updated_at = $3 WHERE user_id = $1",
        [input.userId, input.decision, input.now],
      );

      if (input.decision === "approved") {
        // Candidate becomes active and the photo's 30-day retention clock starts.
        await client.query(
          "UPDATE app_user SET status = 'active', updated_at = $2 WHERE id = $1",
          [input.userId, input.now],
        );
        await client.query(
          "UPDATE verification_photo SET approved_at = $2 WHERE user_id = $1 AND deleted_at IS NULL AND approved_at IS NULL",
          [input.userId, input.now],
        );
      } else if (input.decision === "rejected") {
        // A rejected profile is not published; the candidate cannot resubmit
        // without operator action. Keep the photo for the audit window.
        await client.query(
          "UPDATE app_user SET status = 'suspended', updated_at = $2 WHERE id = $1",
          [input.userId, input.now],
        );
      } else {
        // changes_requested: reopen the draft so the candidate can edit and
        // resubmit; the next submit flips review_status back to 'pending'.
        await client.query(
          "UPDATE onboarding_draft SET submitted_at = NULL, current_step = 'public_preview', updated_at = $2 WHERE user_id = $1",
          [input.userId, input.now],
        );
        await client.query(
          "UPDATE app_user SET status = 'identity_pending', updated_at = $2 WHERE id = $1",
          [input.userId, input.now],
        );
      }
    });
  }
}
