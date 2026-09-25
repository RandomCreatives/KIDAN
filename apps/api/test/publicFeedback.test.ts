import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/appFactory.js";
import { FeedbackService, WEB_FEEDBACK_PUBLIC_CODE } from "../src/feedback/feedbackService.js";
import type { PersistenceRepository } from "../src/persistence/types.js";

/**
 * Route-level tests for the anonymous public "Report a concern" endpoint:
 * happy path, contract validation, honeypot drop, CORS echo/preflight, and
 * the per-IP throttle. The repository is a stub — persistence behaviour is
 * covered by the integration suite against a real database.
 */

const INFO_ORIGIN = "https://kidan-staging-info.vercel.app";

interface StoredCall {
  userId: string | null;
  publicCode: string;
  kind: string;
  body: string;
  source?: string;
  topic?: string | null;
  contact?: string | null;
}

function stubRepository() {
  const calls: StoredCall[] = [];
  const repo = {
    calls,
    async createFeedback(input: StoredCall & { now: Date }) {
      calls.push(input);
      return { id: "1a5fd4a8-4d0e-4b6c-8b1a-4f2b0a4e1234", createdAt: new Date("2026-09-16T10:00:00.000Z") };
    },
  } as unknown as PersistenceRepository & { calls: StoredCall[] };
  return repo;
}

async function appWith(repo: PersistenceRepository, allowedOrigins = [INFO_ORIGIN]) {
  const app = await buildApp({
    logger: false,
    feedbackService: new FeedbackService(repo),
    allowedOrigins,
  });
  return app;
}

function validPayload() {
  return { topic: "privacy", body: "I want my verification photo deleted completely, please." };
}

describe("POST /v1/public/feedback (public info-hub concern)", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  const track = async (repo: PersistenceRepository, origins?: string[]) => {
    const app = await appWith(repo, origins);
    apps.push(app);
    return app;
  };

  it("stores an anonymous web concern and returns 201 with the id", async () => {
    const repo = stubRepository();
    const app = await track(repo);
    const res = await app.inject({
      method: "POST",
      url: "/v1/public/feedback",
      headers: { origin: INFO_ORIGIN, "content-type": "application/json" },
      payload: { ...validPayload(), contact: "@someone" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ data: { id: string; createdAt: string } }>();
    expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.data.createdAt).toBe("2026-09-16T10:00:00.000Z");
    expect(repo.calls).toHaveLength(1);
    expect(repo.calls[0]).toMatchObject({
      userId: null,
      publicCode: WEB_FEEDBACK_PUBLIC_CODE,
      kind: "report",
      source: "web",
      topic: "privacy",
      contact: "@someone",
    });
    // Browser gets CORS headers for the allowlisted origin.
    expect(res.headers["access-control-allow-origin"]).toBe(INFO_ORIGIN);
  });

  it("rejects invalid payloads (topic/body/contact) with 400", async () => {
    const repo = stubRepository();
    const app = await track(repo);
    for (const payload of [
      { topic: "nonsense", body: "hi" },
      { topic: "privacy", body: "" },
      { topic: "privacy", body: "x".repeat(1501) },
      { topic: "privacy", body: "hi", contact: "c".repeat(201) },
    ]) {
      const res = await app.inject({
        method: "POST", url: "/v1/public/feedback",
        headers: { "content-type": "application/json" }, payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error?.code ?? res.json<{ error: { code: string } }>().error.code).toBe("INVALID_REQUEST");
    }
    expect(repo.calls).toHaveLength(0);
  });

  it("silently drops honeypot submissions with a fake success", async () => {
    const repo = stubRepository();
    const app = await track(repo);
    const res = await app.inject({
      method: "POST", url: "/v1/public/feedback",
      headers: { "content-type": "application/json" },
      payload: { ...validPayload(), website: "http://spam.example" },
    });
    expect(res.statusCode).toBe(201);
    expect(repo.calls).toHaveLength(0);
  });

  it("omits CORS headers for origins outside the allowlist", async () => {
    const repo = stubRepository();
    const app = await track(repo);
    const res = await app.inject({
      method: "POST", url: "/v1/public/feedback",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      payload: validPayload(),
    });
    // The origin gate (state-changing request, disallowed origin) kicks in first.
    expect(res.statusCode).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers preflight only for allowlisted origins", async () => {
    const repo = stubRepository();
    const app = await track(repo);
    const ok = await app.inject({
      method: "OPTIONS", url: "/v1/public/feedback",
      headers: { origin: INFO_ORIGIN, "access-control-request-method": "POST" },
    });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(INFO_ORIGIN);
    expect(ok.headers["access-control-allow-headers"]).toContain("Content-Type");

    const bad = await app.inject({
      method: "OPTIONS", url: "/v1/public/feedback",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(bad.statusCode).toBe(403);
  });

  it("throttles after 5 submissions per IP within the window", async () => {
    const repo = stubRepository();
    const app = await track(repo);
    const send = () => app.inject({
      method: "POST", url: "/v1/public/feedback",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      payload: validPayload(),
    });
    for (let i = 0; i < 5; i++) expect((await send()).statusCode).toBe(201);
    const sixth = await send();
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json<{ error: { code: string } }>().error.code).toBe("RATE_LIMITED");
    // A different IP is unaffected.
    const other = await app.inject({
      method: "POST", url: "/v1/public/feedback",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.99" },
      payload: validPayload(),
    });
    expect(other.statusCode).toBe(201);
    expect(repo.calls).toHaveLength(6);
  });
});
