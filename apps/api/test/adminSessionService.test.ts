import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AdminSessionService } from "../src/auth/adminSessionService.js";

function makeService(password = "correct-horse-battery", ttlSeconds = 3600) {
  return new AdminSessionService(randomBytes(32), password, { ttlSeconds });
}

describe("AdminSessionService", () => {
  it("accepts the configured password and rejects others", () => {
    const service = makeService();
    expect(service.verifyPassword("correct-horse-battery")).toBe(true);
    expect(service.verifyPassword("wrong")).toBe(false);
    expect(service.verifyPassword("")).toBe(false);
    // @ts-expect-error non-string must be rejected, not throw
    expect(service.verifyPassword(undefined)).toBe(false);
  });

  it("issues a token that authenticates and yields a CSRF token", () => {
    const service = makeService();
    const issued = service.issue();
    expect(issued.sessionToken.split(".")).toHaveLength(3);
    const session = service.authenticate(issued.sessionToken);
    expect(session).not.toBeNull();
    expect(session?.csrfToken).toBe(issued.csrfToken);
  });

  it("rejects a tampered or malformed token", () => {
    const service = makeService();
    const issued = service.issue();
    expect(service.authenticate("garbage")).toBeNull();
    expect(service.authenticate(`${issued.sessionToken}x`)).toBeNull();
    const parts = issued.sessionToken.split(".");
    parts[2] = Buffer.from("0".repeat(43)).toString("base64url").slice(0, 43);
    expect(service.authenticate(parts.join("."))).toBeNull();
  });

  it("rejects an expired token", () => {
    const service = makeService("pw", 60);
    const issued = service.issue(new Date("2026-01-01T00:00:00Z"));
    // 61 seconds later -> expired
    const later = new Date("2026-01-01T00:01:01Z");
    expect(service.authenticate(issued.sessionToken, later)).toBeNull();
  });

  it("validates the CSRF token only for a matching live session", () => {
    const service = makeService();
    const issued = service.issue();
    expect(service.verifyCsrf(issued.sessionToken, issued.csrfToken)).toBe(true);
    expect(service.verifyCsrf(issued.sessionToken, "nope")).toBe(false);
    expect(service.verifyCsrf(undefined, issued.csrfToken)).toBe(false);
  });

  it("uses an independent signature from a service with a different key", () => {
    const a = makeService();
    const b = makeService();
    const issued = a.issue();
    // Token signed by key A must not authenticate under key B.
    expect(b.authenticate(issued.sessionToken)).toBeNull();
  });
});
