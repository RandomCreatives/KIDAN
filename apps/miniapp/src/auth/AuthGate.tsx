import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth.js";
import { isDebugMode } from "./debugMode.js";

interface AuthGateProps {
  children: ReactNode;
}

function GateScreen({ title, message, action, actionLabel, busy, detail }: {
  title: string;
  message: string;
  action?: () => void;
  actionLabel?: string;
  busy?: boolean;
  detail?: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasAction = Boolean(action && actionLabel);

  useEffect(() => {
    if (hasAction) buttonRef.current?.focus();
    else headingRef.current?.focus();
  }, [hasAction, title]);

  return (
    <main className="screen standard-screen auth-gate" aria-live="polite" aria-busy={busy ? "true" : undefined}>
      <section className="page-intro">
        <span className="section-kicker">Kidan</span>
        <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
        <p>{message}</p>
        {detail && (
          <p className="error-detail" data-testid="auth-error-detail">{detail}</p>
        )}
        {action && actionLabel && (
          <button
            className="primary-button"
            type="button"
            onClick={action}
            ref={buttonRef}
          >
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const { status, isDemo, retry, lastError } = useAuth();
  const detail = isDebugMode() ? lastError : null;

  if (isDemo) return <>{children}</>;

  switch (status) {
    case "authenticated":
      return <>{children}</>;
    case "initializing":
    case "authenticating":
      return <GateScreen title="Connecting…" message="Securing your private session." busy />;
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
          detail={detail}
        />
      );
    case "unavailable":
      return (
        <GateScreen
          title="Account unavailable"
          message="This account cannot be used right now. Contact support if this persists."
        />
      );
    case "service_unavailable":
      return (
        <GateScreen
          title="Kidan is temporarily unavailable"
          message="Our service is finishing setup on our side. Your connection is fine — please try again in a few minutes."
          action={retry}
          actionLabel="Retry"
          detail={detail}
        />
      );
    case "fatal":
      return (
        <GateScreen
          title="Connection error"
          message="We could not reach Kidan. Check your connection and try again."
          action={retry}
          actionLabel="Retry"
          detail={detail}
        />
      );
    default:
      return <GateScreen title="Connecting…" message="Securing your private session." />;
  }
}
