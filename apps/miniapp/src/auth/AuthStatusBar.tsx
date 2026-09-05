import type { AuthStatus } from "./authState.js";
import { useAuth } from "./useAuth.js";

const LABELS: Record<AuthStatus, string> = {
  initializing: "Connecting…",
  authenticating: "Connecting…",
  unauthenticated: "Signed out",
  authenticated: "Signed in",
  expired: "Session expired",
  unavailable: "Account unavailable",
  service_unavailable: "Service temporarily unavailable",
  fatal: "Connection error",
};

export function AuthStatusBar() {
  const { status, isDemo, logout, logoutError, loggingOut } = useAuth();

  if (isDemo) {
    return (
      <div className="demo-banner" role="status">
        <span className="demo-dot" aria-hidden="true" />
        <span>Demo preview — synthetic, local-only. No data is sent or saved.</span>
      </div>
    );
  }

  return (
    <>
      <div className="auth-status-bar" role="status" aria-live="polite" aria-busy={loggingOut ? "true" : undefined}>
        <span className={`auth-dot auth-${status}`} aria-hidden="true" />
        <span>{loggingOut ? "Signing out…" : (LABELS[status] ?? status)}</span>
        {status === "authenticated" && (
          <button type="button" className="auth-logout" onClick={() => void logout()} disabled={loggingOut}>
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        )}
      </div>
      {logoutError && <div className="auth-logout-error" role="alert">{logoutError}</div>}
    </>
  );
}
