import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SessionService } from "../src/auth/sessionService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

function fixture() {
  const repository = new MemoryPersistenceRepository();
  const hasher = new SecretHasher(randomBytes(32));
  const service = new SessionService(
    repository,
    new IdentityCipher(randomBytes(32), randomBytes(32)),
    hasher,
    60,
  );
  return { repository, service };
}

describe("SessionService", () => {
  it("issues an opaque session without returning Telegram or internal user IDs", async () => {
    const { service } = fixture();
    const issued = await service.issueForTelegramUser(251000000000n, new Date(), new Date());
    expect(issued.sessionToken).toHaveLength(43);
    expect(JSON.stringify(issued)).not.toContain("251000000000");
    expect(JSON.stringify(issued)).not.toContain("userId");
  });

  it("expires and revokes sessions", async () => {
    const { service } = fixture();
    const now = new Date("2026-08-12T10:00:00Z");
    const issued = await service.issueForTelegramUser(1n, now, now);
    expect(await service.authenticate(issued.sessionToken, new Date(now.getTime() + 30_000))).not.toBeNull();
    expect(await service.authenticate(issued.sessionToken, new Date(now.getTime() + 61_000))).toBeNull();
    await service.revoke(issued.sessionToken, now);
    expect(await service.authenticate(issued.sessionToken, now)).toBeNull();
  });

  it("validates CSRF tokens independently from session tokens", async () => {
    const { service } = fixture();
    const issued = await service.issueForTelegramUser(1n, new Date());
    const session = await service.authenticate(issued.sessionToken);
    expect(session).not.toBeNull();
    expect(service.verifyCsrf(session!, issued.csrfToken)).toBe(true);
    expect(service.verifyCsrf(session!, issued.sessionToken)).toBe(false);
  });

  it("returns a stable CSRF token on restore that verifies", async () => {
    const { service } = fixture();
    const issued = await service.issueForTelegramUser(1n, new Date());
    const first = await service.restoreSession(issued.sessionToken);
    const second = await service.restoreSession(issued.sessionToken);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.csrfToken).toBe(first!.csrfToken);
    const session = await service.authenticate(issued.sessionToken);
    expect(session).not.toBeNull();
    expect(service.verifyCsrf(session!, second!.csrfToken)).toBe(true);
  });

  it("returns null when restoring a missing session", async () => {
    const { service } = fixture();
    expect(await service.restoreSession("not-a-real-token")).toBeNull();
  });

  it("does not invalidate one restore with a concurrent restore on the same session", async () => {
    const { service } = fixture();
    const issued = await service.issueForTelegramUser(1n, new Date());
    const [a, b] = await Promise.all([
      service.restoreSession(issued.sessionToken),
      service.restoreSession(issued.sessionToken),
    ]);
    expect(a!.csrfToken).toBe(b!.csrfToken);
    const session = await service.authenticate(issued.sessionToken);
    expect(service.verifyCsrf(session!, a!.csrfToken)).toBe(true);
    expect(service.verifyCsrf(session!, b!.csrfToken)).toBe(true);
  });
});
