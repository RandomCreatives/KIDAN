// Verbose on-device diagnostics (error codes, runtime origin, server bot id,
// token verdict) are off for real users — they would leak internal detail on
// what should be a calm, trustworthy error screen. They can be enabled for
// staging/support by opening the Mini App with ?debug=1 (or #debug=1).
export function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.get("debug") === "1") return true;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("debug") === "1") return true;
  } catch {
    return false;
  }
  return false;
}
