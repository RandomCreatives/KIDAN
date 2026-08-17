export type CspEnvironment = "development" | "production";

const TELEGRAM_SDK_ORIGIN = "https://telegram.org";
const TELEGRAM_SDK_HOST = "telegram.org";

export function kidanCspPolicy(environment: CspEnvironment): string {
  const isDev = environment === "development";
  const scriptSources = ["'self'", TELEGRAM_SDK_ORIGIN];
  const connectSources = ["'self'"];
  if (isDev) {
    scriptSources.push("'unsafe-inline'");
    connectSources.push("ws:", "wss:", "http://localhost:4000", "http://localhost:5173");
  }
  return [
    `default-src 'self'`,
    `script-src ${scriptSources.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src ${connectSources.join(" ")}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `block-all-mixed-content`,
  ].join("; ");
}

export const TELEGRAM_SDK_SRC = `${TELEGRAM_SDK_ORIGIN}/js/telegram-web-app.js`;

export function isAllowedCspScriptHost(
  host: string | null | undefined,
  applicationHost: string | null | undefined,
): boolean {
  if (!host) return false;
  return host === TELEGRAM_SDK_HOST || Boolean(applicationHost && host === applicationHost);
}
