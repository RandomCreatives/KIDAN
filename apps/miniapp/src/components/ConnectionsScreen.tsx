import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionItem } from "@kidan/contracts";
import { KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { IntroductionScreen } from "./IntroductionScreen";
import { CheckIcon, ChevronRightIcon, ClockIcon, LockIcon, MailIcon, ShieldCheckIcon, XIcon } from "./Icons";
import { useT } from "../i18n/LanguageProvider";

const STATUS_COPY: Record<string, { title: string; detail: string }> = {
  request_accepted_pending_confirmation: {
    title: "Request accepted",
    detail: "They accepted your introduction. Both of you confirm before an administrator reviews.",
  },
  mutual_confirmed_pending_admin: {
    title: "With the administrator",
    detail: "You both confirmed. An administrator will review before the introduction opens.",
  },
  admin_approved_pending_confirmation: {
    title: "Final confirmation",
    detail: "An administrator approved this introduction. Confirm when you are ready to proceed.",
  },
  connected: {
    title: "Introduction open",
    detail: "A restricted in-app introduction is available. Contact details stay private by design.",
  },
  declined: {
    title: "Declined",
    detail: "This introduction was declined. No further steps are needed.",
  },
};

export function ConnectionsScreen({ onOpenRequests }: { onOpenRequests?: () => void } = {}) {
  const t = useT();
  const { realSubmissionsEnabled, csrfToken } = useAuth();
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();

  const [connections, setConnections] = useState<ConnectionItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openIntroduction, setOpenIntroduction] = useState<ConnectionItem | null>(null);

  const load = useCallback(() => {
    if (!realSubmissionsEnabled) {
      setConnections(null);
      return;
    }
    let cancelled = false;
    void clientRef
      .current!.getConnections()
      .then((list) => {
        if (!cancelled) setConnections(list.connections);
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [realSubmissionsEnabled]);

  useEffect(() => load(), [load]);

  const respond = useCallback(
    (connectionId: string, confirm: boolean) => {
      if (!realSubmissionsEnabled) return;
      setBusy(connectionId);
      if (confirm) haptic("success");
      void clientRef
        .current!.confirmConnection(connectionId, confirm, csrfToken ?? "")
        .then(() => load())
        .catch(() => undefined)
        .finally(() => setBusy(null));
    },
    [realSubmissionsEnabled, csrfToken, load],
  );

  // All hooks must run before any early return (Rules of Hooks). Opening the
  // restricted introduction swaps this screen for IntroductionScreen; doing so
  // above the hooks previously unmounted on a different hook count and blanked
  // the page after both participants confirmed.
  if (openIntroduction) {
    return <IntroductionScreen connection={openIntroduction} onBack={() => setOpenIntroduction(null)} />;
  }

  return (
    <main className="screen standard-screen">
      <header className="topbar"><Brand /><span className="header-label">{t("Connections")}</span></header>
      <section className="page-intro">
        <span className="section-kicker">{t("Private by design")}</span>
        <h1>{t("Your connections")}</h1>
        <p>{t("Only accepted introductions reach here. One-sided decisions are never shown, and no identity is shared until everyone confirms and an administrator approves.")}</p>
      </section>

      {realSubmissionsEnabled && (
        <button type="button" className="status-card pending-card requests-entry" onClick={onOpenRequests}>
          <div className="status-icon amber"><MailIcon /></div>
          <div className="status-copy">
            <span>{t("Introductions")}</span>
            <strong>{t("Review incoming requests & your shortlist")}</strong>
            <p>{t("Send up to 5 deliberate requests a day. Declines are silent and requests expire after 72 hours.")}</p>
          </div>
          <ChevronRightIcon size={19} />
        </button>
      )}

      {realSubmissionsEnabled ? (
        connections === null ? (
          <section className="status-card pending-card" aria-label={t("Loading connections")}>
            <div className="status-icon amber"><ClockIcon /></div>
            <div className="status-copy"><span>{t("Loading")}</span><strong>{t("Checking your introductions…")}</strong></div>
          </section>
        ) : connections.length === 0 ? (
          <section className="process-card">
            <h2>{t("No introductions yet")}</h2>
            <p className="quiet-copy">{t("When two people independently choose each other and an administrator approves, the introduction appears here. Names and contact details remain private throughout.")}</p>
          </section>
        ) : (
          connections.map((connection) => {
            const copy = STATUS_COPY[connection.status] ?? { title: "In progress", detail: "" };
            const isConnected = connection.status === "connected";
            return (
              <section
                key={connection.id}
                className={`status-card pending-card connection-card ${isConnected ? "openable" : ""}`}
                onClick={isConnected ? () => setOpenIntroduction(connection) : undefined}
                role={isConnected ? "button" : undefined}
                tabIndex={isConnected ? 0 : undefined}
                onKeyDown={isConnected ? (event) => { if (event.key === "Enter" || event.key === " ") setOpenIntroduction(connection); } : undefined}
              >
                <div className={`status-icon ${connection.status === "connected" ? "green" : connection.status === "declined" ? "muted" : "amber"}`}>
                  {connection.status === "connected" ? <ShieldCheckIcon /> : <ClockIcon />}
                </div>
                <div className="status-copy">
                  <span>{t(copy.title)}</span>
                  <strong>{labelFor(connection, t)}</strong>
                  <p>{t(copy.detail)}</p>
                </div>
                {confirmable(connection.status) && !connection.iConfirmed && (
                  <div className="connection-actions">
                    <button
                      type="button"
                      className="primary-button connection-button"
                      disabled={busy === connection.id}
                      onClick={() => respond(connection.id, true)}
                    >
                      <CheckIcon size={16} /> {t("Confirm")}
                    </button>
                    <button
                      type="button"
                      className="secondary-button connection-button"
                      disabled={busy === connection.id}
                      onClick={() => respond(connection.id, false)}
                      aria-label={t("Decline introduction")}
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                )}
                {confirmable(connection.status) && connection.iConfirmed && (
                  <div className="status-copy"><span className="waiting-note">{t("Waiting for their confirmation")}</span></div>
                )}
                {connection.status === "connected" && <ChevronRightIcon size={19} />}
              </section>
            );
          })
        )
      ) : (
        <>
          <section className="status-card pending-card">
            <div className="status-icon amber"><ClockIcon /></div>
            <div className="status-copy"><span>{t("Pending review")}</span><strong>{t("One introduction is with the admin")}</strong><p>{t("No identity or contact information has been shared.")}</p></div>
            <ChevronRightIcon size={19} />
          </section>
        </>
      )}

      <section className="process-card">
        <h2>{t("How a connection opens")}</h2>
        <ol className="process-list">
          <li className="complete"><span><ShieldCheckIcon size={17} /></span><div><strong>{t("Mutual interest")}</strong><p>{t("Both people choose independently.")}</p></div></li>
          <li><span>2</span><div><strong>{t("Private admin review")}</strong><p>{t("Eligibility and safety checks.")}</p></div></li>
          <li><span>3</span><div><strong>{t("Final confirmation")}</strong><p>{t("Both people choose to proceed again.")}</p></div></li>
          <li><span><LockIcon size={16} /></span><div><strong>{t("Restricted introduction")}</strong><p>{t("An in-app introduction opens first — never a name, phone, or Telegram link.")}</p></div></li>
        </ol>
      </section>

      <div className="quiet-note"><LockIcon size={17} /><p>{t("Kidan will never place a name, phone number, or profile detail in a bot notification.")}</p></div>
    </main>
  );
}

/** States in which a participant can still confirm or decline. */
function confirmable(status: string): boolean {
  return status === "request_accepted_pending_confirmation"
    || status === "admin_approved_pending_confirmation";
}

/** Values-only label for the other participant — never a name. */
function labelFor(connection: ConnectionItem, t: (key: string) => string = (k) => k): string {
  const { age, city, publicCode } = connection.other;
  return `${age} • ${city || t("Ethiopia")} • ${publicCode}`;
}
