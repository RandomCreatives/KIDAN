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

  const validPatch = {
    schemaVersion: "2026-08-12.v1",
    expectedVersion: 0,
    currentStep: "public_profile",
    patch: { publicProfile: { city: "Addis Ababa" } },
  } as const;

  it("maps 409 DRAFT_VERSION_CONFLICT on save", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "DRAFT_VERSION_CONFLICT", requestId: "r" } }, 409));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client
      .saveDraft({ ...validPatch }, "csrf")
      .catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("DRAFT_VERSION_CONFLICT");
  });

  it("maps 503 REAL_SUBMISSIONS_DISABLED on save", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "REAL_SUBMISSIONS_DISABLED", requestId: "r" } }, 503));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client
      .saveDraft({ ...validPatch }, "csrf")
      .catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("REAL_SUBMISSIONS_DISABLED");
  });

  it("rejects an invalid outgoing patch before sending", async () => {
    const fetchImpl = vi.fn();
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client
      .saveDraft({ currentStep: "public_profile" } as never, "csrf")
      .catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_REQUEST");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on a malformed success body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { authenticated: false } }, 200));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
  });

  it("coerces an unknown server error code to INVALID_RESPONSE", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "WEIRD_CODE", requestId: "r" } }, 500));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
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

  it("preserves a valid logout 401 UNAUTHENTICATED envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: "UNAUTHENTICATED", requestId: "logout_absent" } }, 401),
    );
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.logout("csrf-token").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UNAUTHENTICATED");
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).requestId).toBe("logout_absent");
  });

  it("preserves a valid logout 500 envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: "INTERNAL_ERROR", requestId: "logout_failed" } }, 500),
    );
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.logout("csrf-token").catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INTERNAL_ERROR");
    expect((error as ApiError).status).toBe(500);
  });

  it.each([200, 201, 202])("rejects successful logout status %s because only 204 confirms revocation", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: {} }, status));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.logout("csrf-token").catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
    expect((error as ApiError).status).toBe(status);
  });

  it("maps response-body read failures to NETWORK/0", async () => {
    const response = {
      status: 500,
      ok: false,
      text: vi.fn().mockRejectedValue(new Error("body stream failed")),
    } as unknown as Response;
    const client = new KidanApiClient({
      fetchImpl: vi.fn().mockResolvedValue(response) as unknown as typeof fetch,
    });
    const error = await client.logout("csrf-token").catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("NETWORK");
    expect((error as ApiError).status).toBe(0);
  });

  it("propagates network failures as a typed NETWORK error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("NETWORK");
  });

  it("aborts a stalled fetch at the configured timeout and maps it to NETWORK/0", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(requestSignal?.reason ?? new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      });
      const client = new KidanApiClient({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        requestTimeoutMs: 10,
      });

      const outcome = client.getSession().catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(9);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const error = await outcome;
      expect(requestSignal?.aborted).toBe(true);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("NETWORK");
      expect((error as ApiError).status).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the timeout active through response-body reading and maps expiry to NETWORK/0", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      let bodyReadStarted = false;
      const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () => {
            bodyReadStarted = true;
            return new Promise<string>((_resolve, reject) => {
              requestSignal?.addEventListener(
                "abort",
                () => reject(requestSignal?.reason ?? new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            });
          },
        } as Response);
      });
      const client = new KidanApiClient({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        requestTimeoutMs: 10,
      });

      const outcome = client.getSession().catch((caught: unknown) => caught);
      await Promise.resolve();
      expect(bodyReadStarted).toBe(true);
      await vi.advanceTimersByTimeAsync(9);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const error = await outcome;
      expect(requestSignal?.aborted).toBe(true);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("NETWORK");
      expect((error as ApiError).status).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed on malformed (non-JSON) success body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("502 Bad Gateway", { status: 502, headers: { "content-type": "text/plain" } }));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
    expect((error as ApiError).status).toBe(502);
  });

  it("fails closed on malformed JSON in a 200 body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("{not json", { status: 200, headers: { "content-type": "application/json" } }));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
  });

  it("fails closed when the error envelope lacks a requestId", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
    expect((error as ApiError).requestId).toBeUndefined();
  });

  it("fails closed when the error requestId is not a string", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "UNAUTHENTICATED", requestId: 12345 } }, 401));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
  });

  it("fails closed when the error requestId is an object", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "UNAUTHENTICATED", requestId: { a: 1 } } }, 401));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
  });

  it("fails closed when the error requestId is oversized", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "UNAUTHENTICATED", requestId: "x".repeat(10_000) } }, 401));
    const client = new KidanApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSession().catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
  });
});
