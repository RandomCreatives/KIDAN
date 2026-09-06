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
