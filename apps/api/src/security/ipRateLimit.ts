import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Dependency-free, in-memory sliding-window IP rate limits for the few
 * endpoints that are expensive or abuse-sensitive (session minting, profile
 * submission, verification-photo upload). Business-level limits (requests per
 * day, message pacing) live in the domain services; this is transport-level
 * defence in depth.
 *
 * Telegram initData validation already proves the caller controls a real
 * Telegram account, so these limits exist to blunt credential stuffing,
 * upload floods and scripted submission abuse — not to throttle humans.
 * Disabled automatically in the test environment.
 */

type Rule = { method: string; prefix: string; max: number; windowMs: number };

const RULES: Rule[] = [
  { method: "POST", prefix: "/v1/auth/telegram", max: 120, windowMs: 60 * 60 * 1000 },
  { method: "POST", prefix: "/v1/onboarding/submit", max: 30, windowMs: 60 * 60 * 1000 },
  { method: "PUT", prefix: "/v1/onboarding/verification-photo", max: 30, windowMs: 60 * 60 * 1000 },
];

const hits = new Map<string, number[]>();

function ruleFor(request: FastifyRequest): Rule | null {
  for (const rule of RULES) {
    if (request.method === rule.method && request.url.split("?")[0] === rule.prefix) return rule;
  }
  return null;
}

export function registerIpRateLimits(app: FastifyInstance, options: { enabled: boolean }): void {
  if (!options.enabled) return;
  app.addHook("onRequest", (request, reply, done) => {
    const rule = ruleFor(request);
    if (!rule) return done();
    const now = Date.now();
    const key = `${rule.method} ${rule.prefix} ${request.ip}`;
    const windowStart = now - rule.windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= rule.max) {
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.ceil((oldest + rule.windowMs - now) / 1000);
      reply.code(429).send({
        error: { code: "RATE_LIMITED", requestId: request.id, retryAfterSeconds },
      });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    // Lazy hygiene: keep the map from growing without bound.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) {
        const last = v[v.length - 1];
        if (last === undefined || last < windowStart) hits.delete(k);
      }
    }
    done();
  });
}

export type { FastifyReply };
