import type {
  AdminPendingConnection,
  ConnectionItem,
  ConnectionListResponse,
  DiscoveryProfile,
  IntroductionMessage,
  IntroductionPostRequest,
  IntroductionThread,
  ValueTag,
} from "@kidan/contracts";
import type {
  AdminPendingConnectionRow,
  IntroductionMessageRow,
  IntroductionThreadRow,
  PersistenceRepository,
  UserConnectionRow,
} from "../persistence/types.js";
import type { IdentityCipher } from "../security/crypto.js";

export class ConnectionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionStateError";
  }
}

/** An introduction message as presented to an administrator (values-only). */
interface AdminIntroductionMessageView {
  id: string;
  connectionId: string;
  senderPublicCode: string;
  body: string;
  hidden: boolean;
  createdAt: string;
}

/**
 * Contact-detail patterns that must never cross the restricted introduction
 * channel: Telegram handles/links, generic URLs, and phone-like digit runs.
 * The pilot keeps the introduction in-app; contact reveal is a separate,
 * future, explicitly-consented gate.
 */
const CONTACT_PATTERNS: ReadonlyArray<{ pattern: RegExp; code: string }> = [
  { pattern: /(?:https?:\/\/|www\.)\S+/i, code: "LINKS_NOT_ALLOWED" },
  { pattern: /t(?:elegram)?\.me\//i, code: "CONTACT_NOT_ALLOWED" },
  { pattern: /@[a-z0-9_]{3,}/i, code: "CONTACT_NOT_ALLOWED" },
  { pattern: /(?:\+?251|0)\s?9\s?\d[\d\s-]{6,}\d/, code: "CONTACT_NOT_ALLOWED" },
  { pattern: /\b\d[\d\s-]{8,}\d\b/, code: "CONTACT_NOT_ALLOWED" },
];

export function screenIntroductionBody(rawBody: string): string {
  const body = rawBody.trim();
  if (body.length === 0 || body.length > 600) throw new ConnectionStateError("INVALID_INTRODUCTION");
  for (const { pattern, code } of CONTACT_PATTERNS) {
    if (pattern.test(body)) throw new ConnectionStateError(code);
  }
  return body;
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

  // --- Restricted in-app introduction (D3) ---

  /** Loads the values-only introduction thread for a 'connected' pair. */
  async getThread(userId: string, connectionId: string, now = new Date()): Promise<IntroductionThread> {
    if (!this.realSubmissionsEnabled) throw new ConnectionStateError("REAL_SUBMISSIONS_DISABLED");
    const row = await this.repository.getIntroductionThread({ connectionId, viewerId: userId, now });
    if (!row) throw new ConnectionStateError("INTRODUCTION_NOT_OPEN");
    return this.toThread(row, userId, now);
  }

  /** Posts a moderated introduction message. Contact details are rejected. */
  async postMessage(
    userId: string,
    connectionId: string,
    request: IntroductionPostRequest,
    now = new Date(),
  ): Promise<IntroductionMessage> {
    if (!this.realSubmissionsEnabled) throw new ConnectionStateError("REAL_SUBMISSIONS_DISABLED");
    const body = screenIntroductionBody(request.body);
    const saved = await this.repository.addIntroductionMessage({
      connectionId,
      senderUserId: userId,
      body,
      now,
    });
    return this.toMessage(saved, userId);
  }

  /** Administrator moderation: recent introduction messages across pairs. */
  async listRecentMessages(limit = 50): Promise<{ messages: AdminIntroductionMessageView[] }> {
    const rows = await this.repository.listRecentIntroductionMessages(limit);
    return {
      messages: rows.map((row) => ({
        id: row.id,
        connectionId: row.connectionId,
        senderPublicCode: row.senderCode,
        body: row.body,
        hidden: row.hidden,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Administrator hides an inappropriate message (its body is blanked for both users). */
  async hideMessage(messageId: string): Promise<void> {
    const hidden = await this.repository.hideIntroductionMessage(messageId);
    if (!hidden) throw new ConnectionStateError("MESSAGE_NOT_FOUND");
  }

  private toThread(row: IntroductionThreadRow, viewerId: string, now: Date): IntroductionThread {
    const other: DiscoveryProfile = {
      id: row.other.publicCode,
      publicCode: row.other.publicCode,
      age: this.ageFrom(row.other.dateOfBirthCiphertext, row.other.userId, now),
      gender: row.other.gender as "female" | "male",
      city: row.other.city,
      occupationCategory: row.other.occupationCategory,
      educationLevel: row.other.educationLevel,
      heightCm: row.other.heightCm,
      faithTradition: "ethiopian_orthodox_tewahedo",
      marriageIntention: (row.other.marriageIntention ?? "teklil") as DiscoveryProfile["marriageIntention"],
      values: row.other.values as ValueTag[],
      bio: row.other.bio ?? "",
      verified: true,
      photoMode: "values_only",
    };
    return {
      connectionId: row.connectionId,
      other,
      messages: row.messages.map((message) => this.toMessage(message, viewerId)),
    };
  }

  private toMessage(message: IntroductionMessageRow, viewerId: string): IntroductionMessage {
    return {
      id: message.id,
      fromMe: message.senderUserId === viewerId,
      body: message.hidden ? "" : message.body,
      createdAt: message.createdAt.toISOString(),
      hidden: message.hidden,
    };
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
