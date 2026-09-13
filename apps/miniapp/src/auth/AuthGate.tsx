import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth.js";
import { isDebugMode } from "./debugMode.js";
import { useT } from "../i18n/LanguageProvider";

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
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasAction = Boolean(action && actionLabel);

  useEffect(() => {
    if (hasAction) buttonRef.current?.focus();
    else headingRef.current?.focus();
  }, [hasAction, title]);

  return (
    <main className="screen standard-screen auth-gate" aria-live="polite" aria-busy={busy ? "true" : undefined}>
      <section className="page-intro">
        <span className="section-kicker">{t("Kidan")}</span>
        <h1 ref={headingRef} tabIndex={-1}>{t(title)}</h1>
        <p>{t(message)}</p>
        {detail && (
          <p className="error-detail" data-testid="auth-error-detail">{t(detail)}</p>
        )}
        {action && actionLabel && (
          <button
            className="primary-button"
            type="button"
            onClick={action}
            ref={buttonRef}
          >
            {t(actionLabel)}
          </button>
        )}
      </section>
    </main>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const t = useT();
  const { status, isDemo, retry, lastError } = useAuth();
  const detail = isDebugMode() ? lastError : null;

  if (isDemo) return <>{children}</>;

  switch (status) {
    case "authenticated":
      return <>{children}</>;
    case "initializing":
    case "authenticating":
      return <GateScreen title={t("Connecting…")} message="Securing your private session." busy />;
    case "unauthenticated":
      return (
        <GateScreen
          title={t("Signed out")}
          message="Open Kidan again from Telegram to continue."
        />
      );
    case "expired":
      return (
        <GateScreen
          title={t("Session expired")}
          message="Your private session ended. Reconnect to continue."
          action={retry}
          actionLabel="Reconnect"
          detail={detail}
        />
      );
    case "unavailable":
      return (
        <GateScreen
          title={t("Account unavailable")}
          message="This account cannot be used right now. Contact support if this persists."
        />
      );
    case "service_unavailable":
      return (
        <GateScreen
          title={t("Kidan is temporarily unavailable")}
          message="Our service is finishing setup on our side. Your connection is fine — please try again in a few minutes."
          action={retry}
          actionLabel="Retry"
          detail={detail}
        />
      );
    case "fatal":
      return (
        <GateScreen
          title={t("Connection error")}
          message="We could not reach Kidan. Check your connection and try again."
          action={retry}
          actionLabel="Retry"
          detail={detail}
        />
      );
    default:
      return <GateScreen title={t("Connecting…")} message="Securing your private session." />;
  }
}
