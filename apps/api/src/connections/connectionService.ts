import type {
  AdminPendingConnection,
  ConnectionItem,
  ConnectionListResponse,
} from "@kidan/contracts";
import type { AdminPendingConnectionRow, PersistenceRepository, UserConnectionRow } from "../persistence/types.js";
import type { IdentityCipher } from "../security/crypto.js";

export class ConnectionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionStateError";
  }
}

/**
 * Admin-gated connections (Track D).
 *
 * Lifecycle: mutual interest creates 'mutual_pending_admin' (invisible to
 * users); an administrator approves ('admin_approved_pending_confirmation') or
 * rejects ('admin_rejected'); both participants confirm → 'connected' (either
 * can decline → 'declined'). A 'connected' state still only opens a restricted
 * in-app introduction — contactRevealGate governs anything beyond.
 *
 * Nothing here ever returns a name, phone, photo, or Telegram identity: the
 * other party is represented by values-only fields (public code, age, city,
 * gender).
 */
export class ConnectionService {
  constructor(
    private readonly repository: PersistenceRepository,
    private readonly identityCipher: IdentityCipher,
    private readonly realSubmissionsEnabled: boolean,
  ) {}

  private ageFrom(ciphertext: Buffer, userId: string, now: Date): number {
    const dob = this.identityCipher.decrypt(ciphertext, `${userId}:date-of-birth`);
    const birth = new Date(`${dob}T00:00:00.000Z`);
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
    return age;
  }

  /** Connections visible to the participant (admin approval onward). */
  async listForUser(userId: string, now = new Date()): Promise<ConnectionListResponse> {
    if (!this.realSubmissionsEnabled) return { connections: [] };
    const rows = await this.repository.listUserConnections(userId);
    const connections: ConnectionItem[] = rows.map((row) => this.toItem(row, userId, now));
    return { connections };
  }

  /** Participant confirms (confirm=true) or declines (confirm=false). */
  async confirm(
    userId: string,
    connectionId: string,
    confirm: boolean,
    now = new Date(),
  ): Promise<{ status: string }> {
    if (!this.realSubmissionsEnabled) throw new ConnectionStateError("REAL_SUBMISSIONS_DISABLED");
    const result = await this.repository.setConnectionConfirmation({ connectionId, userId, confirm, now });
    if (!result) throw new ConnectionStateError("CONNECTION_NOT_FOUND");
    return result;
  }

  /** Administrator queue: mutually-interested pairs awaiting approval. */
  async listPending(now = new Date()): Promise<{ connections: AdminPendingConnection[] }> {
    const rows = await this.repository.listPendingConnections();
    return {
      connections: rows.map((row) => ({
        id: row.id,
        userA: {
          publicCode: row.userACode,
          age: this.ageFrom(row.userADobCiphertext, row.userAId, now),
          city: row.userACity,
          gender: row.userAGender as "female" | "male",
        },
        userB: {
          publicCode: row.userBCode,
          age: this.ageFrom(row.userBDobCiphertext, row.userBId, now),
          city: row.userBCity,
          gender: row.userBGender as "female" | "male",
        },
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Administrator approve/reject. */
  async decide(connectionId: string, approve: boolean, now = new Date()): Promise<{ id: string; status: string }> {
    const status = await this.repository.decideConnection({ connectionId, approve, now });
    if (!status) throw new ConnectionStateError("CONNECTION_NOT_PENDING");
    return { id: connectionId, status };
  }

  private toItem(row: UserConnectionRow, viewerId: string, now: Date): ConnectionItem {
    const viewerIsA = row.userAId === viewerId;
    const otherCode = viewerIsA ? row.userBCode : row.userACode;
    const otherDob = viewerIsA ? row.userBDobCiphertext : row.userADobCiphertext;
    const otherCity = viewerIsA ? row.userBCity : row.userACity;
    const otherGender = viewerIsA ? row.userBGender : row.userAGender;
    const otherId = viewerIsA ? row.userBId : row.userAId;
    const iConfirmed = viewerIsA ? row.userAConfirmed : row.userBConfirmed;
    const theyConfirmed = viewerIsA ? row.userBConfirmed : row.userAConfirmed;
    return {
      id: row.id,
      status: row.status as ConnectionItem["status"],
      other: {
        publicCode: otherCode,
        age: this.ageFrom(otherDob, otherId, now),
        city: otherCity,
        gender: otherGender as "female" | "male",
      },
      iConfirmed,
      theyConfirmed,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
