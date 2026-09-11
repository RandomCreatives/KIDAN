import { describe, expect, it } from "vitest";
import { createPairingAnswerer, parsePairingCallback, GENERIC_ACK } from "../src/pairingCallbacks.js";

describe("parsePairingCallback", () => {
  it("parses pair:<pulseId>:<answer> payloads", () => {
    expect(parsePairingCallback("pair:0f3a1c2e-8b7d-4e5f-9a6b-1c2d3e4f5a6b:ready")).toEqual({
      pulseId: "0f3a1c2e-8b7d-4e5f-9a6b-1c2d3e4f5a6b",
      answer: "ready",
    });
  });

  it("uses the last separator so uuids never split the answer", () => {
    const parsed = parsePairingCallback("pair:abc-123:going_well");
    expect(parsed).toEqual({ pulseId: "abc-123", answer: "going_well" });
  });

  it("returns null for menu callbacks and malformed payloads", () => {
    expect(parsePairingCallback('{"a":"menu"}')).toBeNull();
    expect(parsePairingCallback("kidan:menu:back")).toBeNull();
    expect(parsePairingCallback("pair:")).toBeNull();
    expect(parsePairingCallback("pair::")).toBeNull();
    expect(parsePairingCallback("pair::ready")).toBeNull();
    expect(parsePairingCallback("pair:onlyid")).toBeNull();
    expect(parsePairingCallback(`pair:somelong:${"x".repeat(41)}`)).toBeNull();
  });
});

describe("createPairingAnswerer", () => {
  const base = "https://api.example.com/";

  it("forwards the tap to the API with the bot bearer and returns the ack", async () => {
    let seen: { url: string; auth?: string; body?: unknown } | null = null;
    const answerer = createPairingAnswerer({
      apiBaseUrl: base,
      botStateSecret: "shh",
      fetchFn: async (input, init) => {
        seen = { url: String(input), auth: (init?.headers as Record<string, string>).authorization, body: JSON.parse(String(init?.body)) };
        return new Response(JSON.stringify({ data: { text: "🌱 ok" } }), { status: 200 });
      },
    });
    const ack = await answerer(123456789, "pulse-1", "ready");
    expect(ack).toBe("🌱 ok");
    expect(seen).not.toBeNull();
    expect(seen!.url).toBe("https://api.example.com/internal/pairing/answer");
    expect(seen!.auth).toBe("Bearer shh");
    expect(seen!.body).toEqual({ telegramId: 123456789, pulseId: "pulse-1", answer: "ready" });
  });

  it("damps double-taps (409) with an already-answered ack", async () => {
    const answerer = createPairingAnswerer({
      apiBaseUrl: base,
      botStateSecret: "shh",
      fetchFn: async () => new Response(JSON.stringify({ error: { code: "PULSE_ALREADY_ANSWERED" } }), { status: 409 }),
    });
    const ack = await answerer(1, "pulse-1", "recorded");
    expect(ack).toContain("already answered");
  });

  it("stays warm on API errors and network failure", async () => {
    const erroring = createPairingAnswerer({
      apiBaseUrl: base,
      botStateSecret: "shh",
      fetchFn: async () => new Response("boom", { status: 500 }),
    });
    expect(await erroring(1, "p", "ready")).toBe(GENERIC_ACK);
    const offline = createPairingAnswerer({
      apiBaseUrl: base,
      botStateSecret: "shh",
      fetchFn: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    const ack = await offline(1, "p", "ready");
    expect(ack.length).toBeGreaterThan(0);
  });
});
