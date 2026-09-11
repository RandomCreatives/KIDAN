import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/appFactory.js";
import { SessionService } from "../src/auth/sessionService.js";
import { CompletionStateError } from "../src/completion/completionService.js";
import { MemoryPersistenceRepository } from "../src/persistence/memoryRepository.js";
import { IdentityCipher, SecretHasher } from "../src/security/crypto.js";

/**
 * Route-level tests for the Kidan Completion miniapp surface
 * (/v1/pairings/*). Service behavior itself is covered by
 * completionService.test.ts / completionPhase2.test.ts; here we pin the HTTP
 * contract: auth + CSRF, error-code mapping (403/404 privacy, 409 states),
 * request validation, and the exact response shapes the miniapp consumes.
 */
describe("pairing routes (Kidan Completion)", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  const CONNECTION_ID = randomUUID();

  const journeyView = {
    connectionId: CONNECTION_ID,
    stage: "chatting" as const,
    counterpartCode: "KD-223344",
    gate: { gateMet: true, daysRemaining: 0, messagesRemaining: 0 },
    readiness: {
      selfReady: false,
      otherReady: false,
      primerStage: "none" as const,
      notYetCycles: 0,
      zombieReflectionDue: false,
    },
    stalled: false,
    blocked: false,
  };

  /** Minimal CompletionService double — every method spied per-test. */
  function completionStub(overrides: Record<string, unknown> = {}) {
    return {
      getJourneyView: async () => ({ ...journeyView }),
      answerReadiness: async () => ({ state: "one_sided" as const }),
      confirmReveal: async () => ({ revealed: false }),
      getRevealedCounterpart: async () => ({
        publicCode: "KD-223344",
        legalName: "Hanna Bekele",
        phone: "+251911223344",
      }),
      requestClose: async () => ({ followupDueAt: new Date("2026-09-15T06:00:00Z") }),
      reportTogether: async () => undefined,
      ...overrides,
    } as never;
  }

  async function build(completion: unknown) {
    const repository = new MemoryPersistenceRepository();
    const cipher = new IdentityCipher(randomBytes(32), randomBytes(32));
    const sessions = new SessionService(repository, cipher, new SecretHasher(randomBytes(32)));
    app = await buildApp({
      logger: false,
      sessionService: sessions,
      completionService: completion as never,
    });
    return { app, sessions };
  }

  async function issueSession(sessions: SessionService) {
    const issued = await sessions.issueForTelegramUser(931_000_001n, new Date());
    return { token: issued.sessionToken, csrf: issued.csrfToken };
  }

  const SESSION_COOKIE = (token: string) => ({ cookie: `kidan_session=${token}` });

  it("rejects the journey view without a session", async () => {
    const env = await build(completionStub());
    const res = await env.app.inject({ method: "GET", url: `/v1/pairings/${CONNECTION_ID}` });
    expect(res.statusCode).toBe(401);
  });

  it("returns the journey snapshot for a participant", async () => {
    const env = await build(completionStub());
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "GET",
      url: `/v1/pairings/${CONNECTION_ID}`,
      headers: SESSION_COOKIE(me.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      connectionId: CONNECTION_ID,
      stage: "chatting",
      gate: { gateMet: true },
    });
    // Values-only contract: no identity material in the view.
    expect(res.json().data).not.toHaveProperty("legalName");
    expect(res.json().data).not.toHaveProperty("phone");
  });

  it("answers 404 for unknown pairings and non-participants alike (privacy)", async () => {
    const env = await build(
      completionStub({
        getJourneyView: async () => {
          throw new CompletionStateError("NOT_PARTICIPANT", "Viewer is not part of this pairing.");
        },
      }),
    );
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "GET",
      url: `/v1/pairings/${CONNECTION_ID}`,
      headers: SESSION_COOKIE(me.token),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("PAIRING_NOT_FOUND");
  });

  it("requires CSRF for the readiness answer and validates the payload", async () => {
    const env = await build(completionStub());
    const me = await issueSession(env.sessions);
    const noCsrf = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/readiness`,
      headers: SESSION_COOKIE(me.token),
      payload: { answer: "ready" },
    });
    expect(noCsrf.statusCode).toBe(403);
    const badAnswer = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/readiness`,
      headers: { ...SESSION_COOKIE(me.token), "x-csrf-token": me.csrf },
      payload: { answer: "maybe" },
    });
    expect(badAnswer.statusCode).toBe(400);
  });

  it("maps a premature readiness answer to 409 GATE_NOT_MET", async () => {
    const env = await build(
      completionStub({
        answerReadiness: async () => {
          throw new CompletionStateError("GATE_NOT_MET", "The next step unlocks with time and conversation.");
        },
      }),
    );
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/readiness`,
      headers: { ...SESSION_COOKIE(me.token), "x-csrf-token": me.csrf },
      payload: { answer: "ready" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("GATE_NOT_MET");
  });

  it("returns the readiness loop state for a valid answer", async () => {
    const env = await build(completionStub());
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/readiness`,
      headers: { ...SESSION_COOKIE(me.token), "x-csrf-token": me.csrf },
      payload: { answer: "ready" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ state: "one_sided" });
  });

  it("confirm returns the waiting state when only one side confirmed", async () => {
    const env = await build(completionStub());
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/confirm`,
      headers: { ...SESSION_COOKIE(me.token), "x-csrf-token": me.csrf },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ revealed: false });
  });

  it("the second simultaneous confirm unveils the counterpart", async () => {
    const env = await build(
      completionStub({
        confirmReveal: async () => ({
          revealed: true,
          counterpart: { publicCode: "KD-223344", legalName: "Hanna Bekele", phone: "+251911223344" },
        }),
      }),
    );
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/confirm`,
      headers: { ...SESSION_COOKIE(me.token), "x-csrf-token": me.csrf },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      revealed: true,
      counterpart: { publicCode: "KD-223344", legalName: "Hanna Bekele", phone: "+251911223344" },
    });
  });

  it("the reveal read-back is 409 before the reveal happens", async () => {
    const env = await build(
      completionStub({
        getRevealedCounterpart: async () => {
          throw new CompletionStateError("NOT_REVEALED", "Identities unveil together when both are ready.");
        },
      }),
    );
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "GET",
      url: `/v1/pairings/${CONNECTION_ID}/reveal`,
      headers: SESSION_COOKIE(me.token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NOT_REVEALED");
  });

  it("serves the unveiled counterpart post-reveal", async () => {
    const env = await build(completionStub());
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "GET",
      url: `/v1/pairings/${CONNECTION_ID}/reveal`,
      headers: SESSION_COOKIE(me.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.legalName).toBe("Hanna Bekele");
  });

  it("closes a path and reports the scheduled follow-up", async () => {
    const env = await build(completionStub());
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/close`,
      headers: { ...SESSION_COOKIE(me.token), "x-csrf-token": me.csrf },
      payload: { reason: "values differ" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ closed: true, followupDueAt: "2026-09-15T06:00:00.000Z" });
  });

  it("double-closing maps to 409 ALREADY_CLOSED", async () => {
    const env = await build(
      completionStub({
        requestClose: async () => {
          throw new CompletionStateError("ALREADY_CLOSED", "This path is already closed.");
        },
      }),
    );
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/close`,
      headers: { ...SESSION_COOKIE(me.token), "x-csrf-token": me.csrf },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_CLOSED");
  });

  it("reports a couple as Together", async () => {
    const env = await build(completionStub());
    const me = await issueSession(env.sessions);
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/pairings/${CONNECTION_ID}/together`,
      headers: { ...SESSION_COOKIE(me.token), "x-csrf-token": me.csrf },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ completedTogether: true });
  });
});
