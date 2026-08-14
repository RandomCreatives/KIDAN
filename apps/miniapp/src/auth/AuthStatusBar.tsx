import { useAuth } from "./useAuth.js";

const LABELS: Record<string, string> = {
  initializing: "Connecting…",
  authenticating: "Connecting…",
  unauthenticated: "Signed out",
  authenticated: "Signed in",
  expired: "Session expired",
  unavailable: "Account unavailable",
  fatal: "Connection error",
};

export function AuthStatusBar() {
  const { status, isDemo, logout, logoutError } = useAuth();

  if (isDemo) {
    return (
      <div className="demo-banner" role="status">
        <span className="demo-dot" aria-hidden="true" />
        <span>Demo preview — synthetic, local-only. No data is sent or saved.</span>
      </div>
    );
  }

  return (
    <div className="auth-status-bar" role="status">
      <span className={`auth-dot auth-${status}`} aria-hidden="true" />
      <span>{LABELS[status] ?? status}</span>
      {logoutError && <span className="auth-logout-error" role="alert">{logoutError}</span>}
      {status === "authenticated" && (
        <button type="button" className="auth-logout" onClick={() => void logout()}>
          Sign out
        </button>
      )}
    </div>
  );
}
