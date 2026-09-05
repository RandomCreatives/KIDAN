// Non-sensitive runtime context, shown on connection-error screens to diagnose
// whether the Mini App is running on the expected origin. Contains no user
// data, tokens, or initData values — only booleans and the document origin.
export function describeRuntimeContext(baseUrl: string): string {
  if (typeof window === "undefined") return "no-window";
  const parts: string[] = [];
  parts.push(`origin=${window.location.origin}`);
  const path = window.location.pathname;
  if (path && path !== "/") parts.push(`path=${path}`);
  parts.push(`api=${baseUrl.startsWith("http") ? baseUrl : window.location.origin + baseUrl}`);
  const tg = window.Telegram?.WebApp;
  const tgState = !tg ? "absent" : (tg.initData ? "initData:yes" : "initData:empty");
  parts.push(`tg=${tgState}`);
  parts.push(`secure=${window.isSecureContext ? "https" : "INSECURE"}`);
  return parts.join(" | ");
}
