import { createCipheriv, createHmac, randomBytes } from "node:crypto";

const PUBLIC_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ENCRYPTION_VERSION = 1;

export function createPublicProfileCode(): string {
  const bytes = randomBytes(6);
  const suffix = [...bytes]
    .map((byte) => PUBLIC_CODE_ALPHABET.charAt(byte & 31))
    .join("");
  return `KD-${suffix}`;
}

export function createSessionToken(): string {
  return `ks_${randomBytes(32).toString("base64url")}`;
}

export function hmacSha256(value: string, pepper: string): Buffer {
  if (pepper.length < 32) {
    throw new Error("Persistence pepper must be at least 32 characters");
  }
  return createHmac("sha256", pepper).update(value).digest();
}

export function parseIdentityEncryptionKey(rawKey: string): Buffer {
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) {
    throw new Error("IDENTITY_ENCRYPTION_KEY_BASE64 must decode to 32 bytes");
  }
  return key;
}

export function encryptIdentityValue(plaintext: string, key: Buffer): Buffer {
  if (key.length !== 32) {
    throw new Error("Identity encryption key must be 32 bytes");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from([ENCRYPTION_VERSION]), iv, authTag, ciphertext]);
}
