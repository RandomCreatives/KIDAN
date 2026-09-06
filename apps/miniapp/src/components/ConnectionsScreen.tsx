import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionItem } from "@kidan/contracts";
import { KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { CheckIcon, ChevronRightIcon, ClockIcon, LockIcon, ShieldCheckIcon, XIcon } from "./Icons";

const STATUS_COPY: Record<string, { title: string; detail: string }> = {
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

export function ConnectionsScreen() {
  const { realSubmissionsEnabled, csrfToken } = useAuth();
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();

  const [connections, setConnections] = useState<ConnectionItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <main className="screen standard-screen">
      <header className="topbar"><Brand /><span className="header-label">Connections</span></header>
      <section className="page-intro">
        <span className="section-kicker">Private by design</span>
        <h1>Your connections</h1>
        <p>Only mutual interest appears here. One-sided decisions are never shown, and no identity is shared until all gates open.</p>
      </section>

      {realSubmissionsEnabled ? (
        connections === null ? (
          <section className="status-card pending-card" aria-label="Loading connections">
            <div className="status-icon amber"><ClockIcon /></div>
            <div className="status-copy"><span>Loading</span><strong>Checking your introductions…</strong></div>
          </section>
        ) : connections.length === 0 ? (
          <section className="process-card">
            <h2>No introductions yet</h2>
            <p className="quiet-copy">When two people independently choose each other and an administrator approves, the introduction appears here. Names and contact details remain private throughout.</p>
          </section>
        ) : (
          connections.map((connection) => {
            const copy = STATUS_COPY[connection.status] ?? { title: "In progress", detail: "" };
            return (
              <section key={connection.id} className="status-card pending-card connection-card">
                <div className={`status-icon ${connection.status === "connected" ? "green" : connection.status === "declined" ? "muted" : "amber"}`}>
                  {connection.status === "connected" ? <ShieldCheckIcon /> : <ClockIcon />}
                </div>
                <div className="status-copy">
                  <span>{copy.title}</span>
                  <strong>{labelFor(connection)}</strong>
                  <p>{copy.detail}</p>
                </div>
                {connection.status === "admin_approved_pending_confirmation" && !connection.iConfirmed && (
                  <div className="connection-actions">
                    <button
                      type="button"
                      className="primary-button connection-button"
                      disabled={busy === connection.id}
                      onClick={() => respond(connection.id, true)}
                    >
                      <CheckIcon size={16} /> Confirm
                    </button>
                    <button
                      type="button"
                      className="secondary-button connection-button"
                      disabled={busy === connection.id}
                      onClick={() => respond(connection.id, false)}
                      aria-label="Decline introduction"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                )}
                {connection.status === "admin_approved_pending_confirmation" && connection.iConfirmed && (
                  <div className="status-copy"><span className="waiting-note">Waiting for their confirmation</span></div>
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
            <div className="status-copy"><span>Pending review</span><strong>One introduction is with the admin</strong><p>No identity or contact information has been shared.</p></div>
            <ChevronRightIcon size={19} />
          </section>
        </>
      )}

      <section className="process-card">
        <h2>How a connection opens</h2>
        <ol className="process-list">
          <li className="complete"><span><ShieldCheckIcon size={17} /></span><div><strong>Mutual interest</strong><p>Both people choose independently.</p></div></li>
          <li><span>2</span><div><strong>Private admin review</strong><p>Eligibility and safety checks.</p></div></li>
          <li><span>3</span><div><strong>Final confirmation</strong><p>Both people choose to proceed again.</p></div></li>
          <li><span><LockIcon size={16} /></span><div><strong>Restricted introduction</strong><p>An in-app introduction opens first — never a name, phone, or Telegram link.</p></div></li>
        </ol>
      </section>

      <div className="quiet-note"><LockIcon size={17} /><p>Kidan will never place a name, phone number, or profile detail in a bot notification.</p></div>
    </main>
  );
}

/** Values-only label for the other participant — never a name. */
function labelFor(connection: ConnectionItem): string {
  const { age, city, publicCode } = connection.other;
  return `${age} • ${city || "Ethiopia"} • ${publicCode}`;
}
