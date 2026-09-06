import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminApiClient, AdminApiError } from "./client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AdminApiClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs in, stores the CSRF token, and sends it on decisions", async () => {
    const calls: RequestInit[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      const path = String(url);
      if (path.endsWith("/v1/admin/session")) {
        return jsonResponse({ data: { authenticated: true, csrfToken: "csrf-abcdef0123456789", label: "Pilot Administrator" } });
      }
      if (path.endsWith("/decision")) {
        return jsonResponse({ data: { decision: "approved", reviewStatus: "approved" } });
      }
      return jsonResponse({ data: {} });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AdminApiClient("/api");
    const session = await client.login("secret");
    expect(session.csrfToken).toBe("csrf-abcdef0123456789");

    const result = await client.decide("KD-ABC123", { decision: "approved" });
    expect(result.reviewStatus).toBe("approved");

    const decisionInit = calls[calls.length - 1]!;
    expect(decisionInit.method).toBe("POST");
    expect((decisionInit.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-abcdef0123456789");
    expect(decisionInit.credentials).toBe("same-origin");
  });

  it("parses the queue into validated items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            items: [
              {
                publicCode: "KD-2A3B4C",
                gender: "female",
                city: "Addis Ababa",
                age: 27,
                submittedAt: "2026-09-01T10:00:00.000Z",
                reviewStatus: "pending",
                hasPhoto: true,
              },
            ],
          },
        }),
      ),
    );
    const client = new AdminApiClient("/api");
    const items = await client.listQueue();
    expect(items).toHaveLength(1);
    expect(items[0]!.publicCode).toBe("KD-2A3B4C");
  });

  it("lists pending connections as values-only pairs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            connections: [
              {
                id: "123e4567-e89b-12d3-a456-426614174000",
                userA: { publicCode: "KD-2A3B4C", age: 28, city: "Addis Ababa", gender: "male" },
                userB: { publicCode: "KD-9X8Y7Z", age: 26, city: "Adama", gender: "female" },
                createdAt: "2026-09-06T10:00:00.000Z",
              },
            ],
          },
        }),
      ),
    );
    const client = new AdminApiClient("/api");
    const connections = await client.listPendingConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0]!.userB.publicCode).toBe("KD-9X8Y7Z");
    expect(JSON.stringify(connections[0])).not.toContain("phone");
  });

  it("posts a connection decision with the CSRF token", async () => {
    const decisionResponse = jsonResponse({
      data: { id: "123e4567-e89b-12d3-a456-426614174000", status: "admin_approved_pending_confirmation" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: { authenticated: true, csrfToken: "admin-csrf-token-0123456789", label: "Operator" } }),
      )
      .mockResolvedValueOnce(decisionResponse);
    vi.stubGlobal("fetch", fetchMock);
    const client = new AdminApiClient("/api");
    await client.login("operator-password");
    const result = await client.decideConnection("123e4567-e89b-12d3-a456-426614174000", "approved");
    expect(result.status).toBe("admin_approved_pending_confirmation");
    const lastCall = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(lastCall[0]).toBe("/api/v1/admin/connections/123e4567-e89b-12d3-a456-426614174000/decision");
    expect(lastCall[1].method).toBe("POST");
    expect(lastCall[1].headers).toMatchObject({ "x-csrf-token": expect.any(String) });
    expect(lastCall[1].body).toBe(JSON.stringify({ decision: "approved" }));
  });

  it("returns null session on 401 during restore", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401)));
    const client = new AdminApiClient("/api");
    expect(await client.restoreSession()).toBeNull();
  });

  it("maps a non-OK envelope to AdminApiError with the code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "FEEDBACK_REQUIRED" } }, 422)));
    const client = new AdminApiClient("/api");
    await expect(client.decide("KD-000000", { decision: "rejected" })).rejects.toMatchObject({
      code: "FEEDBACK_REQUIRED",
      status: 422,
    });
  });

  it("reports a NETWORK error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const client = new AdminApiClient("/api");
    await expect(client.listQueue()).rejects.toBeInstanceOf(AdminApiError);
  });
});
