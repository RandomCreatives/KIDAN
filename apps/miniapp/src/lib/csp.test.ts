// @vitest-environment node
import { describe, expect, it } from "vitest";
import nginxProductionConfig from "../../deploy/nginx.conf?raw";
import { kidanCspPolicy, TELEGRAM_SDK_SRC, isAllowedCspScriptHost } from "./csp.js";

describe("kidanCspPolicy", () => {
  it("restricts production to same-origin and the reviewed Telegram SDK host (T4-07)", () => {
    const policy = kidanCspPolicy("production");
    const directives = policy.split("; ").reduce<Record<string, string>>((acc, directive) => {
      const [key = "", ...rest] = directive.split(" ");
      acc[key] = rest.join(" ");
      return acc;
    }, {});
    expect(policy).toContain("default-src 'self'");
    expect(directives["script-src"]).toBe("'self' https://telegram.org");
    expect(directives["style-src"]).toContain("'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("block-all-mixed-content");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directives["script-src"]).not.toContain("'unsafe-inline'");
    expect(policy).not.toMatch(/https?:\/\/(?!telegram\.org)/);
  });

  it("permits dev HMR sockets but still blocks eval (T4-07)", () => {
    const policy = kidanCspPolicy("development");
    expect(policy).toContain("'unsafe-inline'");
    expect(policy).toContain("ws:");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("keeps the production Nginx response header identical to the reviewed policy (T5-07)", () => {
    const expected = `add_header Content-Security-Policy "${kidanCspPolicy("production")}" always;`;
    expect(nginxProductionConfig).toContain(expected);
    expect(nginxProductionConfig).toContain("location /api/");
    expect(nginxProductionConfig).toContain("proxy_pass http://kidan-api:4000/");
  });

  it("points the SDK loader at the reviewed Telegram host (T4-07)", () => {
    expect(TELEGRAM_SDK_SRC).toBe("https://telegram.org/js/telegram-web-app.js");
  });

  it("only allows the Telegram SDK host for scripts (T4-07)", () => {
    expect(isAllowedCspScriptHost("localhost")).toBe(false);
    expect(isAllowedCspScriptHost("telegram.org")).toBe(true);
    expect(isAllowedCspScriptHost("evil.example.com")).toBe(false);
    expect(isAllowedCspScriptHost(null)).toBe(false);
  });
});
