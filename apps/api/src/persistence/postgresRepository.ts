import type { Pool, PoolClient } from "pg";
import { publicOnboardingPayloadSchema } from "@kidan/contracts";
import { withTransaction } from "../database/pool.js";
import type {
  AdminDecisionInput,
  AdminQueueRow,
  AdminIntroductionMessageRow,
  AdminPendingConnectionRow,
  AdminReviewAuditRow,
  IntroductionMessageRow,
  IntroductionRequestRow,
  IntroductionThreadRow,
  AdminSubmissionRow,
  CandidateReviewState,
  DiscoveryCandidateRow,
  DraftRecord,
  UserConnectionRow,
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

  async revokeAllSessionsForUser(userId: string, now: Date): Promise<void> {
    await this.pool.query(
      "UPDATE app_session SET revoked_at = COALESCE(revoked_at, $2) WHERE user_id = $1 AND revoked_at IS NULL",
      [userId, now],
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
          values_json, bio, photo_mode, review_status, updated_at,
          has_godfather, is_deacon, church_service_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          'ethiopian_orthodox_tewahedo', $12, $13::jsonb, $14, 'values_only', 'pending', $15,
          $16, $17, $18
        )
        ON CONFLICT (user_id) DO UPDATE SET
          gender = EXCLUDED.gender, city_code = EXCLUDED.city_code,
          education_level = EXCLUDED.education_level, field_of_study = EXCLUDED.field_of_study,
          employment_status = EXCLUDED.employment_status,
          occupation_category = EXCLUDED.occupation_category, height_cm = EXCLUDED.height_cm,
          marital_status = EXCLUDED.marital_status, has_children = EXCLUDED.has_children,
          wants_children = EXCLUDED.wants_children, marriage_intention = EXCLUDED.marriage_intention,
          values_json = EXCLUDED.values_json, bio = EXCLUDED.bio, review_status = 'pending',
          has_godfather = EXCLUDED.has_godfather, is_deacon = EXCLUDED.is_deacon,
          church_service_active = EXCLUDED.church_service_active,
          profile_version = discovery_profile.profile_version + 1, updated_at = EXCLUDED.updated_at
      `, [
        input.userId, profile.gender, profile.city, profile.educationLevel, profile.fieldOfStudy || null,
        profile.employmentStatus, profile.occupationCategory, profile.heightCm, profile.maritalStatus,
        profile.hasChildren, faith.wantsChildren, faith.marriageIntention,
        JSON.stringify(faith.values), faith.bio, input.now,
        faith.hasGodfather,
        // Deacon question is asked of men; women store NULL (not applicable).
        profile.gender === "male" ? (faith.isDeacon ?? false) : null,
        faith.churchServiceActive,
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

  async replaceVerificationPhoto(userId: string, input: { photoCiphertext: Buffer; mediaType: string }): Promise<void> {
    await this.pool.query(
      "UPDATE verification_photo SET photo_ciphertext = $2, media_type = $3 WHERE user_id = $1 AND deleted_at IS NULL",
      [userId, input.photoCiphertext, input.mediaType],
    );
  }

  async hasVerificationPhoto(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ present: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM verification_photo WHERE user_id = $1 AND deleted_at IS NULL) AS present",
      [userId],
    );
    return result.rows[0]?.present === true;
  }

  async countAdmittedCandidates(): Promise<number> {
    // Admitted = submitted (awaiting review) or approved/active. Purely a
    // cohort head-count; returns a number, never identifying rows.
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM app_user WHERE status IN ('profile_pending', 'active')",
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getUserStatus(userId: string): Promise<UserRecord["status"] | null> {
    const result = await this.pool.query<{ status: string }>(
      "SELECT status::text AS status FROM app_user WHERE id = $1",
      [userId],
    );
    return (result.rows[0]?.status ?? null) as UserRecord["status"] | null;
  }

  async recordOperationalEvent(event: string, now: Date): Promise<void> {
    // Append-only, PII-free operational signal for alerting. Never writes the
    // request body, headers, or any identity data into metadata_json.
    await this.pool.query(
      "INSERT INTO audit_event (actor_type, actor_id, action, subject_type, metadata_json, occurred_at) VALUES ('service', NULL, $1, 'operational', '{}'::jsonb, $2)",
      [event, now],
    );
  }

  async countOperationalEventsSince(events: string[], since: Date): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_event WHERE actor_type = 'service' AND action = ANY($1::text[]) AND occurred_at >= $2",
      [events, since],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getFunnelCounts(): Promise<{
    submitted: number;
    approved: number;
    shortlisted: number;
    requestsPending: number;
    requestsAccepted: number;
    requestsDeclined: number;
    requestsExpired: number;
    connectionsPendingAdmin: number;
    connectionsConnected: number;
    connectionsDeclined: number;
    connectionsRejected: number;
  }> {
    // Counts only; never selects identifying columns.
    const result = await this.pool.query<{
      submitted: string;
      approved: string;
      shortlisted: string;
      requests_pending: string;
      requests_accepted: string;
      requests_declined: string;
      requests_expired: string;
      connections_pending_admin: string;
      connections_connected: string;
      connections_declined: string;
      connections_rejected: string;
    }>(`
      SELECT
        (SELECT count(*) FROM discovery_profile)::text AS submitted,
        (SELECT count(*) FROM discovery_profile WHERE review_status = 'approved')::text AS approved,
        (SELECT count(*) FROM discovery_decision WHERE decision = 'interested')::text AS shortlisted,
        (SELECT count(*) FROM introduction_request WHERE status = 'pending')::text AS requests_pending,
        (SELECT count(*) FROM introduction_request WHERE status = 'accepted')::text AS requests_accepted,
        (SELECT count(*) FROM introduction_request WHERE status = 'declined')::text AS requests_declined,
        (SELECT count(*) FROM introduction_request WHERE status = 'expired')::text AS requests_expired,
        (SELECT count(*) FROM connection WHERE status = 'mutual_confirmed_pending_admin')::text AS connections_pending_admin,
        (SELECT count(*) FROM connection WHERE status = 'connected')::text AS connections_connected,
        (SELECT count(*) FROM connection WHERE status = 'declined')::text AS connections_declined,
        (SELECT count(*) FROM connection WHERE status = 'admin_rejected')::text AS connections_rejected
    `);
    const r = result.rows[0]!;
    return {
      submitted: Number(r.submitted),
      approved: Number(r.approved),
      shortlisted: Number(r.shortlisted),
      requestsPending: Number(r.requests_pending),
      requestsAccepted: Number(r.requests_accepted),
      requestsDeclined: Number(r.requests_declined),
      requestsExpired: Number(r.requests_expired),
      connectionsPendingAdmin: Number(r.connections_pending_admin),
      connectionsConnected: Number(r.connections_connected),
      connectionsDeclined: Number(r.connections_declined),
      connectionsRejected: Number(r.connections_rejected),
    };
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

  async getPublicCode(userId: string): Promise<string | null> {
    const result = await this.pool.query<{ public_code: string }>(
      "SELECT public_code FROM app_user WHERE id = $1",
      [userId],
    );
    return result.rows[0]?.public_code ?? null;
  }

  async getDiscoveryGender(userId: string): Promise<string | null> {
    const result = await this.pool.query<{ gender: string }>(
      "SELECT gender FROM discovery_profile WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.gender ?? null;
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

  async getCandidateReviewState(userId: string): Promise<CandidateReviewState | null> {
    const result = await this.pool.query<{
      has_profile: boolean;
      review_status: string | null;
      submitted: boolean;
      note_ciphertext: Buffer | null;
      decided_at: Date | null;
    }>(`
      SELECT
        (p.user_id IS NOT NULL) AS has_profile,
        p.review_status::text AS review_status,
        (d.submitted_at IS NOT NULL) AS submitted,
        pr.note_ciphertext,
        pr.decided_at
      FROM onboarding_draft d
      LEFT JOIN discovery_profile p ON p.user_id = d.user_id
      LEFT JOIN profile_review pr ON pr.user_id = d.user_id
      WHERE d.user_id = $1
    `, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    if (!row.has_profile) {
      return { exists: false, reviewStatus: null, submitted: row.submitted, noteCiphertext: null, decidedAt: null };
    }
    return {
      exists: true,
      reviewStatus: (row.review_status as CandidateReviewState["reviewStatus"]) ?? "pending",
      submitted: row.submitted,
      noteCiphertext: row.note_ciphertext ?? null,
      decidedAt: row.decided_at ?? null,
    };
  }

  async getCandidateTelegramIdCiphertext(userId: string): Promise<Buffer | null> {
    const result = await this.pool.query<{ telegram_id_ciphertext: Buffer }>(
      "SELECT telegram_id_ciphertext FROM identity_vault WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.telegram_id_ciphertext ?? null;
  }

  async getIdentityCiphertexts(userId: string): Promise<{
    legalNameCiphertext: Buffer | null;
    phoneCiphertext: Buffer | null;
    dateOfBirthCiphertext: Buffer | null;
  } | null> {
    const result = await this.pool.query<{
      legal_name_ciphertext: Buffer | null;
      phone_ciphertext: Buffer | null;
      date_of_birth_ciphertext: Buffer | null;
    }>(`
      SELECT legal_name_ciphertext, phone_ciphertext, date_of_birth_ciphertext
      FROM identity_vault WHERE user_id = $1
    `, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      legalNameCiphertext: row.legal_name_ciphertext ?? null,
      phoneCiphertext: row.phone_ciphertext ?? null,
      dateOfBirthCiphertext: row.date_of_birth_ciphertext ?? null,
    };
  }

  async listConsentReceipts(userId: string): Promise<SubmissionConsent[]> {
    const result = await this.pool.query<{
      purpose: string;
      policy_version: string;
      granted: boolean;
      recorded_at: Date;
    }>(`
      SELECT purpose, policy_version, granted, recorded_at
      FROM consent_receipt WHERE user_id = $1 ORDER BY recorded_at ASC
    `, [userId]);
    return result.rows.map((row) => ({
      purpose: row.purpose,
      policyVersion: row.policy_version,
      granted: row.granted,
      recordedAt: row.recorded_at,
    }));
  }

  async deleteAccount(userId: string, now: Date): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      // Remove profile-review rows tied to this subject (subject_id has no FK).
      await client.query(
        "DELETE FROM admin_review WHERE subject_type = 'profile' AND subject_id = $1",
        [userId],
      );
      await client.query("DELETE FROM profile_review WHERE user_id = $1", [userId]);
      // Everything personal hangs off app_user with ON DELETE CASCADE.
      const result = await client.query("DELETE FROM app_user WHERE id = $1", [userId]);
      void now;
      return (result.rowCount ?? 0) > 0;
    });
  }

  async listDiscoveryCandidates(input: {
    actorUserId: string;
    limit: number;
    offset: number;
  }): Promise<DiscoveryCandidateRow[]> {
    const result = await this.pool.query<{
      user_id: string;
      public_code: string;
      gender: string;
      city_code: string;
      education_level: string | null;
      occupation_category: string | null;
      height_cm: number | null;
      marriage_intention: string | null;
      values_json: string[];
      bio: string | null;
      has_godfather: boolean;
      is_deacon: boolean | null;
      church_service_active: boolean;
      date_of_birth_ciphertext: Buffer;
    }>(`
      SELECT u.id AS user_id, u.public_code, p.gender, p.city_code,
             p.education_level, p.occupation_category, p.height_cm,
             p.marriage_intention, p.values_json, p.bio,
             p.has_godfather, p.is_deacon, p.church_service_active,
             v.date_of_birth_ciphertext
      FROM discovery_profile p
      JOIN app_user u ON u.id = p.user_id
      JOIN identity_vault v ON v.user_id = u.id
      WHERE p.review_status = 'approved'
        AND u.status = 'active'
        AND u.id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM discovery_decision d
          WHERE d.actor_user_id = $1 AND d.target_user_id = u.id
        )
        -- Respect the actor's partner-gender preference.
        AND p.gender = (
          SELECT CASE WHEN ap.gender = 'male' THEN 'female' ELSE 'male' END
          FROM discovery_profile ap WHERE ap.user_id = $1
        )
      ORDER BY p.reviewed_at DESC NULLS LAST, u.created_at DESC
      LIMIT $2 OFFSET $3
    `, [input.actorUserId, input.limit, input.offset]);
    return result.rows.map((row) => ({
      userId: row.user_id,
      publicCode: row.public_code,
      gender: row.gender,
      city: row.city_code,
      educationLevel: row.education_level,
      occupationCategory: row.occupation_category,
      heightCm: row.height_cm,
      marriageIntention: row.marriage_intention,
      values: Array.isArray(row.values_json) ? row.values_json : [],
      bio: row.bio,
      hasGodfather: row.has_godfather,
      isDeacon: row.is_deacon,
      churchServiceActive: row.church_service_active,
      dateOfBirthCiphertext: row.date_of_birth_ciphertext,
    }));
  }

  async saveDiscoveryDecision(input: {
    actorUserId: string;
    targetUserId: string;
    decision: "pass" | "interested";
    idempotencyKey: string;
    now: Date;
  }): Promise<boolean> {
    const result = await this.pool.query(`
      INSERT INTO discovery_decision (actor_user_id, target_user_id, decision, idempotency_key)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (actor_user_id, target_user_id) DO NOTHING
    `, [input.actorUserId, input.targetUserId, input.decision, input.idempotencyKey]);
    return (result.rowCount ?? 0) > 0;
  }

  async hasDiscoveryDecision(actorUserId: string, targetUserId: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM discovery_decision WHERE actor_user_id = $1 AND target_user_id = $2 LIMIT 1",
      [actorUserId, targetUserId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async recordDecisionAndMaybeConnect(input: {
    actorUserId: string;
    targetUserId: string;
    decision: "pass" | "interested";
    idempotencyKey: string;
    now: Date;
  }): Promise<string | null> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query(`
        INSERT INTO discovery_decision (actor_user_id, target_user_id, decision, idempotency_key)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (actor_user_id, target_user_id) DO NOTHING
      `, [input.actorUserId, input.targetUserId, input.decision, input.idempotencyKey]);
      if ((inserted.rowCount ?? 0) === 0) return null;
      // Track D2: a right swipe is a PRIVATE shortlist entry only. It never
      // creates an admin item or a connection — connections are born solely
      // from an accepted intentional introduction request. Mutual swiping is
      // at most a bonus signal, so no connection is created here.
      return null;
    });
  }

  async listUserConnections(userId: string): Promise<UserConnectionRow[]> {
    const result = await this.pool.query<{
      id: string; status: string;
      user_a_id: string; user_b_id: string;
      ua_code: string; ub_code: string;
      ua_dob: Buffer; ub_dob: Buffer;
      ua_city: string; ub_city: string;
      ua_gender: string; ub_gender: string;
      ua_conf: boolean; ub_conf: boolean;
      updated_at: Date;
    }>(`
      SELECT c.id, c.status::text AS status, c.user_a_id, c.user_b_id,
             ua.public_code AS ua_code, ub.public_code AS ub_code,
             va.date_of_birth_ciphertext AS ua_dob, vb.date_of_birth_ciphertext AS ub_dob,
             pa.city_code AS ua_city, pb.city_code AS ub_city,
             pa.gender::text AS ua_gender, pb.gender::text AS ub_gender,
             (cc_a.confirmed IS TRUE) AS ua_conf, (cc_b.confirmed IS TRUE) AS ub_conf,
             c.updated_at
      FROM connection c
      JOIN app_user ua ON ua.id = c.user_a_id
      JOIN app_user ub ON ub.id = c.user_b_id
      JOIN identity_vault va ON va.user_id = ua.id
      JOIN identity_vault vb ON vb.user_id = ub.id
      JOIN discovery_profile pa ON pa.user_id = ua.id
      JOIN discovery_profile pb ON pb.user_id = ub.id
      LEFT JOIN connection_confirmation cc_a ON cc_a.connection_id = c.id AND cc_a.user_id = c.user_a_id AND cc_a.confirmed
      LEFT JOIN connection_confirmation cc_b ON cc_b.connection_id = c.id AND cc_b.user_id = c.user_b_id AND cc_b.confirmed
      WHERE (c.user_a_id = $1 OR c.user_b_id = $1)
        AND c.status NOT IN ('mutual_pending_admin', 'mutual_confirmed_pending_admin', 'admin_rejected')
      ORDER BY c.updated_at DESC
    `, [userId]);
    return result.rows.map((r) => ({
      id: r.id, status: r.status,
      userAId: r.user_a_id, userBId: r.user_b_id,
      userACode: r.ua_code, userBCode: r.ub_code,
      userADobCiphertext: r.ua_dob, userBDobCiphertext: r.ub_dob,
      userACity: r.ua_city, userBCity: r.ub_city,
      userAGender: r.ua_gender, userBGender: r.ub_gender,
      userAConfirmed: r.ua_conf, userBConfirmed: r.ub_conf,
      updatedAt: r.updated_at,
    }));
  }

  async setConnectionConfirmation(input: {
    connectionId: string; userId: string; confirm: boolean; now: Date;
  }): Promise<{ status: string } | null> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<{ status: string; user_a_id: string; user_b_id: string }>(`
        SELECT status::text AS status, user_a_id, user_b_id
        FROM connection WHERE id = $1 FOR UPDATE
      `, [input.connectionId]);
      const row = result.rows[0];
      if (!row) return null;
      if (row.user_a_id !== input.userId && row.user_b_id !== input.userId) return null;
      // Track D2: after a request is accepted the pair confirms FIRST
      // ('request_accepted_pending_confirmation'); once both confirm the pair
      // moves to the admin queue ('mutual_confirmed_pending_admin') and the
      // administrator acts LAST. (The legacy 'admin_approved_pending_confirmation'
      // path — admin first — is retained for any in-flight rows.)
      const confirmableStates = [
        "request_accepted_pending_confirmation",
        "admin_approved_pending_confirmation",
      ];
      if (!confirmableStates.includes(row.status)) {
        return { status: row.status };
      }
      await client.query(`
        INSERT INTO connection_confirmation (connection_id, user_id, confirmed, confirmed_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (connection_id, user_id) DO UPDATE SET confirmed = EXCLUDED.confirmed, confirmed_at = EXCLUDED.confirmed_at
      `, [input.connectionId, input.userId, input.confirm, input.now]);

      if (!input.confirm) {
        await client.query(
          "UPDATE connection SET status = 'declined', closed_at = $2, updated_at = $2 WHERE id = $1",
          [input.connectionId, input.now],
        );
        return { status: "declined" };
      }

      const both = await client.query<{ both_confirmed: boolean }>(`
        SELECT (count(*) FILTER (WHERE confirmed) >= 2) AS both_confirmed
        FROM connection_confirmation WHERE connection_id = $1
      `, [input.connectionId]);
      if (both.rows[0]?.both_confirmed) {
        if (row.status === "request_accepted_pending_confirmation") {
          // Both participants confirmed -> administrator reviews next.
          await client.query(
            "UPDATE connection SET status = 'mutual_confirmed_pending_admin', updated_at = $2 WHERE id = $1",
            [input.connectionId, input.now],
          );
          return { status: "mutual_confirmed_pending_admin" };
        }
        // Legacy admin-first flow: both confirm after approval -> connected.
        await client.query(
          "UPDATE connection SET status = 'connected', opened_at = $2, updated_at = $2 WHERE id = $1",
          [input.connectionId, input.now],
        );
        return { status: "connected" };
      }
      return { status: row.status };
    });
  }

  async listPendingConnections(): Promise<AdminPendingConnectionRow[]> {
    const result = await this.pool.query<{
      id: string; user_a_id: string; user_b_id: string;
      ua_code: string; ub_code: string;
      ua_dob: Buffer; ub_dob: Buffer;
      ua_city: string; ub_city: string;
      ua_gender: string; ub_gender: string;
      created_at: Date;
    }>(`
      SELECT c.id, c.user_a_id, c.user_b_id, c.created_at,
             ua.public_code AS ua_code, ub.public_code AS ub_code,
             va.date_of_birth_ciphertext AS ua_dob, vb.date_of_birth_ciphertext AS ub_dob,
             pa.city_code AS ua_city, pb.city_code AS ub_city,
             pa.gender::text AS ua_gender, pb.gender::text AS ub_gender
      FROM connection c
      JOIN app_user ua ON ua.id = c.user_a_id
      JOIN app_user ub ON ub.id = c.user_b_id
      JOIN identity_vault va ON va.user_id = ua.id
      JOIN identity_vault vb ON vb.user_id = ub.id
      JOIN discovery_profile pa ON pa.user_id = ua.id
      JOIN discovery_profile pb ON pb.user_id = ub.id
      WHERE c.status = 'mutual_confirmed_pending_admin'
      ORDER BY c.created_at ASC
    `);
    return result.rows.map((r) => ({
      id: r.id, userAId: r.user_a_id, userBId: r.user_b_id,
      userACode: r.ua_code, userBCode: r.ub_code,
      userADobCiphertext: r.ua_dob, userBDobCiphertext: r.ub_dob,
      userACity: r.ua_city, userBCity: r.ub_city,
      userAGender: r.ua_gender, userBGender: r.ub_gender,
      createdAt: r.created_at,
    }));
  }

  async decideConnection(input: { connectionId: string; approve: boolean; now: Date }): Promise<string | null> {
    return withTransaction(this.pool, async (client) => {
      // Track D2: the administrator acts LAST. Approving a pair that both
      // participants confirmed opens the restricted introduction ('connected');
      // rejecting -> 'admin_rejected'. Legacy 'mutual_pending_admin' rows
      // (admin-first) still route to 'admin_approved_pending_confirmation'.
      const result = await client.query<{ status: string }>(
        `UPDATE connection
         SET status = CASE
               WHEN $2 AND status = 'mutual_confirmed_pending_admin' THEN 'connected'::connection_status
               WHEN $2 THEN 'admin_approved_pending_confirmation'::connection_status
               ELSE 'admin_rejected'::connection_status
             END,
             admin_approved_at = CASE WHEN $2 THEN $3 ELSE admin_approved_at END,
             opened_at = CASE WHEN $2 AND status = 'mutual_confirmed_pending_admin' THEN $3 ELSE opened_at END,
             closed_at = CASE WHEN $2 THEN closed_at ELSE $3 END,
             updated_at = $3
         WHERE id = $1 AND status IN ('mutual_confirmed_pending_admin', 'mutual_pending_admin')
         RETURNING status::text AS status`,
        [input.connectionId, input.approve, input.now],
      );
      const status = result.rows[0]?.status ?? null;
      if (!status) return null;
      // Data minimization: once a pair is connected their swipe and request
      // records are deleted (the connection + messages are retained).
      if (status === "connected") {
        const conn = await client.query<{ user_a_id: string; user_b_id: string }>(
          "SELECT user_a_id, user_b_id FROM connection WHERE id = $1",
          [input.connectionId],
        );
        const pair = conn.rows[0];
        if (pair) {
          await client.query(
            `DELETE FROM discovery_decision
             WHERE (actor_user_id = $1 AND target_user_id = $2)
                OR (actor_user_id = $2 AND target_user_id = $1)`,
            [pair.user_a_id, pair.user_b_id],
          );
          await client.query(
            `DELETE FROM introduction_request
             WHERE (sender_user_id = $1 AND recipient_user_id = $2)
                OR (sender_user_id = $2 AND recipient_user_id = $1)`,
            [pair.user_a_id, pair.user_b_id],
          );
        }
      }
      return status;
    });
  }

  async getIntroductionThread(input: {
    connectionId: string;
    viewerId: string;
    now: Date;
  }): Promise<IntroductionThreadRow | null> {
    void input.now;
    const conn = await this.pool.query<{
      status: string; user_a_id: string; user_b_id: string;
      other_id: string; other_code: string; other_dob: Buffer;
      other_gender: string; other_city: string;
      other_education: string | null; other_occupation: string | null;
      other_height: number | null; other_marriage: string | null;
      other_values: string[]; other_bio: string | null;
      other_godfather: boolean; other_deacon: boolean | null; other_church: boolean;
    }>(`
      SELECT c.status::text AS status, c.user_a_id, c.user_b_id,
             ou.id AS other_id, ou.public_code AS other_code,
             ov.date_of_birth_ciphertext AS other_dob,
             op.gender::text AS other_gender, op.city_code AS other_city,
             op.education_level AS other_education, op.occupation_category AS other_occupation,
             op.height_cm AS other_height, op.marriage_intention AS other_marriage,
             op.values_json AS other_values, op.bio AS other_bio,
             op.has_godfather AS other_godfather, op.is_deacon AS other_deacon,
             op.church_service_active AS other_church
      FROM connection c
      JOIN app_user ou ON ou.id = CASE WHEN c.user_a_id = $2 THEN c.user_b_id ELSE c.user_a_id END
      JOIN identity_vault ov ON ov.user_id = ou.id
      JOIN discovery_profile op ON op.user_id = ou.id
      WHERE c.id = $1
        AND (c.user_a_id = $2 OR c.user_b_id = $2)
        AND c.status = 'connected'
    `, [input.connectionId, input.viewerId]);
    const row = conn.rows[0];
    if (!row) return null;

    const messages = await this.pool.query<{
      id: string; sender_user_id: string; body: string; hidden_by_admin: boolean; created_at: Date;
    }>(`
      SELECT id, sender_user_id, body, hidden_by_admin, created_at
      FROM introduction_message
      WHERE connection_id = $1
      ORDER BY created_at ASC, id ASC
    `, [input.connectionId]);

    return {
      connectionId: input.connectionId,
      status: row.status,
      viewerIsA: row.user_a_id === input.viewerId,
      other: {
        userId: row.other_id,
        publicCode: row.other_code,
        dateOfBirthCiphertext: row.other_dob,
        gender: row.other_gender,
        city: row.other_city,
        educationLevel: row.other_education,
        occupationCategory: row.other_occupation,
        heightCm: row.other_height,
        marriageIntention: row.other_marriage,
        values: row.other_values ?? [],
        bio: row.other_bio,
        hasGodfather: row.other_godfather,
        isDeacon: row.other_deacon,
        churchServiceActive: row.other_church,
      },
      messages: messages.rows.map((m) => ({
        id: m.id,
        senderUserId: m.sender_user_id,
        body: m.hidden_by_admin ? "" : m.body,
        hidden: m.hidden_by_admin,
        createdAt: m.created_at,
      })),
    };
  }

  async addIntroductionMessage(input: {
    connectionId: string;
    senderUserId: string;
    body: string;
    now: Date;
  }): Promise<IntroductionMessageRow> {
    const result = await this.pool.query<{
      id: string; sender_user_id: string; body: string; hidden_by_admin: boolean; created_at: Date;
    }>(`
      INSERT INTO introduction_message (connection_id, sender_user_id, body, created_at)
      SELECT $1, $2, $3, $4
      WHERE EXISTS (
        SELECT 1 FROM connection
        WHERE id = $1 AND status = 'connected'
          AND (user_a_id = $2 OR user_b_id = $2)
      )
      RETURNING id, sender_user_id, body, hidden_by_admin, created_at
    `, [input.connectionId, input.senderUserId, input.body, input.now]);
    const row = result.rows[0];
    if (!row) throw new SubmissionStateError("INTRODUCTION_NOT_OPEN");
    return {
      id: row.id,
      senderUserId: row.sender_user_id,
      body: row.body,
      hidden: row.hidden_by_admin,
      createdAt: row.created_at,
    };
  }

  async listRecentIntroductionMessages(limit: number): Promise<AdminIntroductionMessageRow[]> {
    const result = await this.pool.query<{
      id: string; connection_id: string; sender_code: string;
      body: string; hidden_by_admin: boolean; created_at: Date;
    }>(`
      SELECT m.id, m.connection_id, su.public_code AS sender_code,
             m.body, m.hidden_by_admin, m.created_at
      FROM introduction_message m
      JOIN app_user su ON su.id = m.sender_user_id
      ORDER BY m.created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows.map((r) => ({
      id: r.id,
      connectionId: r.connection_id,
      senderCode: r.sender_code,
      body: r.body,
      hidden: r.hidden_by_admin,
      createdAt: r.created_at,
    }));
  }

  async hideIntroductionMessage(messageId: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE introduction_message SET hidden_by_admin = true WHERE id = $1 AND hidden_by_admin = false",
      [messageId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // --- Track D2: intentional introduction requests ---

  async createIntroductionRequest(input: {
    senderUserId: string;
    recipientUserId: string;
    idempotencyKey: string;
    now: Date;
    ttlHours: number;
  }): Promise<{ id: string; status: string } | { duplicate: true; id: string; status: string }> {
    void input.idempotencyKey; // pair-level uniqueness handles retries
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query<{ id: string; status: string }>(`
        INSERT INTO introduction_request (sender_user_id, recipient_user_id, status, created_at, expires_at)
        VALUES ($1, $2, 'pending', $3::timestamptz, $3::timestamptz + make_interval(hours => $4::int))
        ON CONFLICT (sender_user_id, recipient_user_id) DO NOTHING
        RETURNING id, status::text AS status
      `, [input.senderUserId, input.recipientUserId, input.now, String(input.ttlHours)]);
      if (inserted.rows[0]) {
        return { id: inserted.rows[0].id, status: inserted.rows[0].status };
      }
      // A row already exists for this ordered pair.
      const existing = await client.query<{ id: string; status: string }>(
        "SELECT id, status::text AS status FROM introduction_request WHERE sender_user_id = $1 AND recipient_user_id = $2",
        [input.senderUserId, input.recipientUserId],
      );
      const row = existing.rows[0];
      if (!row) {
        // Extremely rare race; treat as a fresh insert.
        const retry = await client.query<{ id: string; status: string }>(`
          INSERT INTO introduction_request (sender_user_id, recipient_user_id, status, created_at, expires_at)
          VALUES ($1, $2, 'pending', $3::timestamptz, $3::timestamptz + make_interval(hours => $4::int))
          RETURNING id, status::text AS status
        `, [input.senderUserId, input.recipientUserId, input.now, String(input.ttlHours)]);
        const r = retry.rows[0]!;
        return { id: r.id, status: r.status };
      }
      // A live (pending/accepted) request blocks a new one. A terminal
      // (declined/expired) request is replaced by a fresh pending request.
      if (row.status === "pending" || row.status === "accepted") {
        return { duplicate: true, id: row.id, status: row.status };
      }
      const reopened = await client.query<{ id: string; status: string }>(`
        UPDATE introduction_request
        SET status = 'pending', created_at = $3::timestamptz, expires_at = $3::timestamptz + make_interval(hours => $4::int), responded_at = NULL
        WHERE id = $1 AND sender_user_id = $2
        RETURNING id, status::text AS status
      `, [row.id, input.senderUserId, input.now, String(input.ttlHours)]);
      const r = reopened.rows[0]!;
      return { id: r.id, status: r.status };
    });
  }

  async countRequestsSince(senderUserId: string, since: Date): Promise<number> {
    const result = await this.pool.query(
      "SELECT count(*)::int AS c FROM introduction_request WHERE sender_user_id = $1 AND created_at >= $2",
      [senderUserId, since],
    );
    return result.rows[0]?.c ?? 0;
  }

  /** Shared values-only profile mapping for the OTHER party on a request. */
  private mapRequestRow(r: Record<string, unknown>): IntroductionRequestRow {
    return {
      id: r.id as string,
      status: r.status as string,
      senderUserId: r.sender_user_id as string,
      recipientUserId: r.recipient_user_id as string,
      createdAt: r.created_at as Date,
      expiresAt: r.expires_at as Date,
      other: {
        userId: r.other_id as string,
        publicCode: r.other_code as string,
        dateOfBirthCiphertext: r.other_dob as Buffer,
        gender: r.other_gender as string,
        city: r.other_city as string,
        educationLevel: (r.other_education as string | null) ?? null,
        occupationCategory: (r.other_occupation as string | null) ?? null,
        heightCm: (r.other_height as number | null) ?? null,
        marriageIntention: (r.other_marriage as string | null) ?? null,
        values: Array.isArray(r.other_values) ? (r.other_values as string[]) : [],
        bio: (r.other_bio as string | null) ?? null,
        hasGodfather: Boolean(r.other_godfather),
        isDeacon: (r.other_deacon as boolean | null) ?? null,
        churchServiceActive: Boolean(r.other_church),
      },
    };
  }

  private async queryRequests(viewerId: string, sql: string, params: unknown[]): Promise<IntroductionRequestRow[]> {
    const result = await this.pool.query(sql, params);
    void viewerId;
    return result.rows.map((r) => this.mapRequestRow(r as unknown as Record<string, unknown>));
  }

  async listIncomingRequests(recipientUserId: string, now: Date): Promise<IntroductionRequestRow[]> {
    const sql = `
      SELECT r.id, r.status::text AS status, r.sender_user_id, r.recipient_user_id,
             r.created_at, r.expires_at,
             ou.id AS other_id, ou.public_code AS other_code,
             ov.date_of_birth_ciphertext AS other_dob,
             op.gender::text AS other_gender, op.city_code AS other_city,
             op.education_level AS other_education, op.occupation_category AS other_occupation,
             op.height_cm AS other_height, op.marriage_intention AS other_marriage,
             op.values_json AS other_values, op.bio AS other_bio,
             op.has_godfather AS other_godfather, op.is_deacon AS other_deacon,
             op.church_service_active AS other_church
      FROM introduction_request r
      JOIN app_user ou ON ou.id = r.sender_user_id
      JOIN identity_vault ov ON ov.user_id = ou.id
      JOIN discovery_profile op ON op.user_id = ou.id
      WHERE r.recipient_user_id = $1 AND r.status = 'pending' AND r.expires_at > $2
      ORDER BY r.created_at DESC
    `;
    return this.queryRequests(recipientUserId, sql, [recipientUserId, now]);
  }

  async listOutgoingRequests(senderUserId: string, now: Date): Promise<IntroductionRequestRow[]> {
    const sql = `
      SELECT r.id, r.status::text AS status, r.sender_user_id, r.recipient_user_id,
             r.created_at, r.expires_at,
             ou.id AS other_id, ou.public_code AS other_code,
             ov.date_of_birth_ciphertext AS other_dob,
             op.gender::text AS other_gender, op.city_code AS other_city,
             op.education_level AS other_education, op.occupation_category AS other_occupation,
             op.height_cm AS other_height, op.marriage_intention AS other_marriage,
             op.values_json AS other_values, op.bio AS other_bio,
             op.has_godfather AS other_godfather, op.is_deacon AS other_deacon,
             op.church_service_active AS other_church
      FROM introduction_request r
      JOIN app_user ou ON ou.id = r.recipient_user_id
      JOIN identity_vault ov ON ov.user_id = ou.id
      JOIN discovery_profile op ON op.user_id = ou.id
      WHERE r.sender_user_id = $1 AND r.status IN ('pending', 'accepted', 'declined') AND r.expires_at > $2
      ORDER BY r.created_at DESC
    `;
    return this.queryRequests(senderUserId, sql, [senderUserId, now]);
  }

  async respondToRequest(input: {
    requestId: string;
    recipientUserId: string;
    accept: boolean;
    now: Date;
  }): Promise<{ status: string; connectionId: string | null } | null> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query<{ id: string; status: string; sender_user_id: string; expires_at: Date }>(`
        SELECT id, status::text AS status, sender_user_id, expires_at
        FROM introduction_request
        WHERE id = $1 AND recipient_user_id = $2
        FOR UPDATE
      `, [input.requestId, input.recipientUserId]);
      const req = locked.rows[0];
      if (!req || req.status !== "pending" || req.expires_at <= input.now) return null;

      if (!input.accept) {
        await client.query(
          "UPDATE introduction_request SET status = 'declined', responded_at = $2 WHERE id = $1",
          [input.requestId, input.now],
        );
        return { status: "declined", connectionId: null };
      }

      await client.query(
        "UPDATE introduction_request SET status = 'accepted', responded_at = $2 WHERE id = $1",
        [input.requestId, input.now],
      );
      // Normalize the pair into a canonical (user_a, user_b) connection.
      const pair = await client.query<{ a: string; b: string }>(
        `SELECT CASE WHEN sender_user_id::text < recipient_user_id::text THEN sender_user_id ELSE recipient_user_id END AS a,
                CASE WHEN sender_user_id::text < recipient_user_id::text THEN recipient_user_id ELSE sender_user_id END AS b
         FROM introduction_request WHERE id = $1`,
        [input.requestId],
      );
      const { a, b } = pair.rows[0]!;
      const conn = await client.query<{ id: string }>(`
        INSERT INTO connection (user_a_id, user_b_id, status, created_at, updated_at)
        VALUES ($1, $2, 'request_accepted_pending_confirmation', $3, $3)
        ON CONFLICT (user_a_id, user_b_id) DO UPDATE
          SET status = 'request_accepted_pending_confirmation',
              closed_at = NULL, opened_at = NULL, admin_approved_at = NULL, updated_at = $3
        RETURNING id
      `, [a, b, input.now]);
      const connectionId = conn.rows[0]!.id;
      // Reset any confirmations from a prior (declined/closed) attempt.
      await client.query("DELETE FROM connection_confirmation WHERE connection_id = $1", [connectionId]);
      return { status: "accepted", connectionId };
    });
  }

  async purgeExpiredIntroductionData(
    now: Date,
  ): Promise<{ expiredRequests: number; deletedRequests: number; deletedSwipes: number }> {
    return withTransaction(this.pool, async (client) => {
      // Purge unanswered (pending past TTL) and soft-declined requests.
      const expired = await client.query(
        `DELETE FROM introduction_request
         WHERE status IN ('pending', 'declined') AND expires_at <= $1`,
        [now],
      );
      const expiredRequests = expired.rowCount ?? 0;

      // Data minimization: connected pairs keep the connection + messages but
      // lose their swipe and request records.
      const swipes = await client.query(
        `DELETE FROM discovery_decision d
         USING connection c
         WHERE c.status = 'connected'
           AND ((d.actor_user_id = c.user_a_id AND d.target_user_id = c.user_b_id)
             OR (d.actor_user_id = c.user_b_id AND d.target_user_id = c.user_a_id))`,
      );
      const deletedSwipes = swipes.rowCount ?? 0;

      const reqs = await client.query(
        `DELETE FROM introduction_request r
         USING connection c
         WHERE c.status = 'connected'
           AND ((r.sender_user_id = c.user_a_id AND r.recipient_user_id = c.user_b_id)
             OR (r.sender_user_id = c.user_b_id AND r.recipient_user_id = c.user_a_id))`,
      );
      const deletedRequests = reqs.rowCount ?? 0;

      return { expiredRequests, deletedRequests, deletedSwipes };
    });
  }
}
