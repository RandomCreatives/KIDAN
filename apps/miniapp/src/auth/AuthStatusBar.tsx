import { useAuth } from "./useAuth.js";

const LABELS: Record<string, string> = {
  initializing: "Connecting…",
  unauthenticated: "Signed out",
  authenticated: "Signed in",
  expired: "Session expired",
  unavailable: "Account unavailable",
  fatal: "Connection error",
};

export function AuthStatusBar() {
  const { status, isDemo, logout } = useAuth();
  if (isDemo) return null;
  return (
    <div className="auth-status-bar" role="status">
      <span className={`auth-dot auth-${status}`} aria-hidden="true" />
      <span>{LABELS[status] ?? status}</span>
      {status === "authenticated" && (
        <button type="button" className="auth-logout" onClick={() => void logout()}>
          Sign out
        </button>
      )}
    </div>
  );
}
