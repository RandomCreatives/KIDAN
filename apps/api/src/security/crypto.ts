import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENVELOPE_VERSION = 1;

export function decodeBase64Key(encoded: string, label: string): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${label} must be a base64-encoded 32-byte key`);
  }
  return key;
}

export class IdentityCipher {
  constructor(
    private readonly encryptionKey: Buffer,
    private readonly lookupKey: Buffer,
  ) {
    if (encryptionKey.length !== KEY_BYTES || lookupKey.length !== KEY_BYTES) {
      throw new Error("Identity keys must each be 32 bytes");
    }
  }

  encrypt(value: string, context: string): Buffer {
    return this.encryptBuffer(Buffer.from(value, "utf8"), context);
  }

  /**
   * Encrypts arbitrary bytes (e.g. a verification photo) with the same
   * AES-256-GCM envelope as string fields. The binary payload never touches
   * discovery and is decrypted only for private administrator verification.
   */
  encryptBuffer(value: Buffer, context: string): Buffer {
    if (!context) throw new Error("Identity encryption context is required");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from([ENVELOPE_VERSION]), iv, tag, ciphertext]);
  }

  decrypt(envelope: Buffer, context: string): string {
    return this.decryptBuffer(envelope, context).toString("utf8");
  }

  decryptBuffer(envelope: Buffer, context: string): Buffer {
    if (!context) throw new Error("Identity encryption context is required");
    if (envelope.length < 1 + IV_BYTES + TAG_BYTES || envelope[0] !== ENVELOPE_VERSION) {
      throw new Error("Invalid identity ciphertext envelope");
    }
    const iv = envelope.subarray(1, 1 + IV_BYTES);
    const tag = envelope.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const ciphertext = envelope.subarray(1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  lookupHash(value: string): Buffer {
    return createHmac("sha256", this.lookupKey).update(value).digest();
  }
}

export class SecretHasher {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) throw new Error("Hashing key must be 32 bytes");
  }

  hash(value: string): Buffer {
    return createHmac("sha256", this.key).update(value).digest();
  }

  matches(value: string, expected: Buffer): boolean {
    const actual = this.hash(value);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
