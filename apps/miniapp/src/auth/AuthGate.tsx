import type { ReactNode } from "react";
import { useAuth } from "./useAuth.js";

interface AuthGateProps {
  children: ReactNode;
}

function GateScreen({ title, message, action, actionLabel }: {
  title: string;
  message: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <main className="screen standard-screen auth-gate">
      <section className="page-intro">
        <span className="section-kicker">Kidan</span>
        <h1>{title}</h1>
        <p>{message}</p>
        {action && actionLabel && (
          <button className="primary-button" type="button" onClick={action}>
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const { status, isDemo, retry, logout } = useAuth();

  if (isDemo) return <>{children}</>;

  switch (status) {
    case "authenticated":
      return <>{children}</>;
    case "initializing":
    case "authenticating":
      return <GateScreen title="Connecting…" message="Securing your private session." />;
    case "unauthenticated":
      return (
        <GateScreen
          title="Signed out"
          message="Open Kidan again from Telegram to continue."
        />
      );
    case "expired":
      return (
        <GateScreen
          title="Session expired"
          message="Your private session ended. Reconnect to continue."
          action={retry}
          actionLabel="Reconnect"
        />
      );
    case "unavailable":
      return (
        <GateScreen
          title="Account unavailable"
          message="This account cannot be used right now. Contact support if this persists."
        />
      );
    case "fatal":
      return (
        <GateScreen
          title="Connection error"
          message="We could not reach Kidan. Check your connection and try again."
          action={retry}
          actionLabel="Retry"
        />
      );
    default:
      return <GateScreen title="Connecting…" message="Securing your private session." />;
  }
}

export function AuthGateFooter() {
  const { isDemo, logout, logoutError } = useAuth();
  if (isDemo) return null;
  return (
    <div className="auth-gate-footer">
      {logoutError && <span className="auth-logout-error" role="alert">{logoutError}</span>}
      <button type="button" className="auth-logout" onClick={() => void logout()}>
        Sign out
      </button>
    </div>
  );
}
