import { describe, expect, it, vi } from "vitest";
import { ApiError, KidanApiClient } from "./client.js";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const okSession = {
  authenticated: true,
  csrfToken: "x".repeat(43),
  profileStatus: "new",
  expiresAt: new Date().toISOString(),
} as const;

describe("KidanApiClient", () => {
  it("reads the data envelope on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: okSession }, 200));
    const client = new KidanApiClient({ baseUrl: "/api", fetchImpl: fetchImpl as unknown as typeof fetch });
    const session = await client.getSession();
    expect(session.authenticated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/session",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("maps 401 to UNAUTHENTICATED ApiError", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "UNAUTHENTICATED", requestId: "r1" } }, 401));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UNAUTHENTICATED");
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).requestId).toBe("r1");
  });

  it("maps 403 to INVALID_CSRF and ACCOUNT_UNAVAILABLE", async () => {
    const csrfClient = new KidanApiClient({
      fetchImpl: (async () => jsonResponse({ error: { code: "INVALID_CSRF", requestId: "r" } }, 403)) as unknown as typeof fetch,
    });
    const csrfError = await csrfClient.getSession().catch((caught: unknown) => caught);
    expect((csrfError as ApiError).code).toBe("INVALID_CSRF");

    const acctClient = new KidanApiClient({
      fetchImpl: (async () => jsonResponse({ error: { code: "ACCOUNT_UNAVAILABLE", requestId: "r" } }, 403)) as unknown as typeof fetch,
    });
    const acctError = await acctClient.getSession().catch((caught: unknown) => caught);
    expect((acctError as ApiError).code).toBe("ACCOUNT_UNAVAILABLE");
  });

  it("maps 409 DRAFT_VERSION_CONFLICT on save", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "DRAFT_VERSION_CONFLICT", requestId: "r" } }, 409));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client
      .saveDraft({ currentStep: "public_profile" }, "csrf")
      .catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("DRAFT_VERSION_CONFLICT");
  });

  it("maps 503 REAL_SUBMISSIONS_DISABLED on save", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "REAL_SUBMISSIONS_DISABLED", requestId: "r" } }, 503));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client
      .saveDraft({ currentStep: "public_profile" }, "csrf")
      .catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("REAL_SUBMISSIONS_DISABLED");
  });

  it("sends the CSRF header on mutations and handles 204 logout", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.logout("csrf-token");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/session/logout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
      }),
    );
  });

  it("propagates network failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("network down");
  });
});
