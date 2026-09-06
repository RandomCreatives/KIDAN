import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

describe("IdentityCipher", () => {
  it("encrypts and authenticates identity values", () => {
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const encrypted = cipher.encrypt("synthetic@example.test", "user-1:email");
    expect(encrypted.toString("utf8")).not.toContain("synthetic@example.test");
    expect(cipher.decrypt(encrypted, "user-1:email")).toBe("synthetic@example.test");
    expect(() => cipher.decrypt(encrypted, "user-2:email")).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const encrypted = cipher.encrypt("private", "user-1:legal-name");
    const lastIndex = encrypted.length - 1;
    encrypted[lastIndex] = (encrypted[lastIndex] ?? 0) ^ 1;
    expect(() => cipher.decrypt(encrypted, "user-1:legal-name")).toThrow();
  });

  it("encrypts and decrypts binary buffers (verification photo) with context binding", () => {
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const encrypted = cipher.encryptBuffer(photo, "user-1:verification-photo");
    expect(encrypted.includes(photo)).toBe(false);
    const decrypted = cipher.decryptBuffer(encrypted, "user-1:verification-photo");
    expect(decrypted.equals(photo)).toBe(true);
    // Wrong context must fail authentication.
    expect(() => cipher.decryptBuffer(encrypted, "user-2:verification-photo")).toThrow();
  });

  it("creates stable keyed lookup hashes without exposing the input", () => {
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    expect(cipher.lookupHash("123").equals(cipher.lookupHash("123"))).toBe(true);
    expect(cipher.lookupHash("123").toString("utf8")).not.toContain("123");
  });
});

describe("SecretHasher", () => {
  it("matches opaque secrets using keyed hashes", () => {
    const hasher = new SecretHasher(randomBytes(32));
    const expected = hasher.hash("opaque-token");
    expect(hasher.matches("opaque-token", expected)).toBe(true);
    expect(hasher.matches("wrong-token", expected)).toBe(false);
  });
});
