import { describe, expect, it } from "vitest";
import { buildApp } from "../appFactory.js";

// Regression: a duplicate phone number surfaces from persistence as a
// PostgreSQL unique-violation (code 23505 on identity_vault.phone_lookup_hash).
// It must map to a recoverable 409 PHONE_ALREADY_REGISTERED, never a generic
// 500 (the pilot e2e surfaced it as an unlabeled failure).
describe("private-identity duplicate phone", () => {
  it("maps a 23505 unique violation to 409 PHONE_ALREADY_REGISTERED", async () => {
    const session = {
      user: { id: "00000000-0000-4000-8000-0000000000b1" },
      csrf: "csrf-token",
    };
    const sessionService = {
      authenticate: async () => session,
      verifyCsrf: (s: unknown, token: string) => s === session && token === session.csrf,
    } as never;
    const onboardingService = {
      isRealSubmissionsEnabled: () => true,
      saveVerificationPhoto: async () => undefined,
      savePrivateIdentity: async () => {
        const error = new Error('duplicate key value violates unique constraint "identity_vault_phone_lookup_hash_key"');
        (error as unknown as { code: string }).code = "23505";
        throw error;
      },
    } as never;
    const app = await buildApp({
      sessionService,
      onboardingService,
      botToken: "test-token",
      logger: false,
    });
    const response = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/private-identity",
      headers: { "content-type": "application/json", "x-csrf-token": session.csrf },
      payload: { fullName: "Test Person", dateOfBirth: "1990-01-01", phoneNumber: "+251911000000" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("PHONE_ALREADY_REGISTERED");
    await app.close();
  });
});
