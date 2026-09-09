import { describe, expect, it, vi } from "vitest";
import { createTierResolver } from "./tierResolver.js";

describe("tier resolver (Option A)", () => {
  it("maps an active response to 'active'", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { tier: "active" } }),
    });
    const resolve = createTierResolver({ apiBaseUrl: "https://api.test", botStateSecret: "s", fetchFn });
    expect(await resolve(42)).toBe("active");
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("telegramId=42"),
      expect.objectContaining({ headers: { authorization: "Bearer s" } }),
    );
  });

  it("maps a new user to 'new'", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { tier: "new" } }) });
    const resolve = createTierResolver({ apiBaseUrl: "https://api.test", botStateSecret: "s", fetchFn });
    expect(await resolve(1)).toBe("new");
  });

  it("fails open to 'new' when the API is unreachable", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("net down"));
    const resolve = createTierResolver({ apiBaseUrl: "https://api.test", botStateSecret: "s", fetchFn });
    expect(await resolve(1)).toBe("new");
  });

  it("fails open to 'new' on a non-ok response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const resolve = createTierResolver({ apiBaseUrl: "https://api.test", botStateSecret: "s", fetchFn });
    expect(await resolve(1)).toBe("new");
  });
});
