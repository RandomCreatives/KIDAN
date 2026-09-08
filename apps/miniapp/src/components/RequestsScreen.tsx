import { useCallback, useEffect, useRef, useState } from "react";
import type { IntroductionSummary, OutgoingRequestItem } from "@kidan/contracts";
import { KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { CheckIcon, ChevronLeftIcon, ClockIcon, LockIcon, ShieldCheckIcon, XIcon } from "./Icons";

/**
 * Track D2 — intentional introduction requests.
 *
 * Incoming: pending requests addressed to the caller, each showing the
 * sender's values-only strong-basics summary (no name/photo/contact). The
 * recipient accepts or declines; a decline is silent and never disclosed to
 * the sender.
 *
 * Outgoing ("Your shortlist" reflection): the requests the caller has sent,
 * with a rolling 24h allowance counter. Declines are shown as still pending,
 * and expiring requests simply disappear — no rejection signal.
 */
export function RequestsScreen({ onBack }: { onBack: () => void }) {
  const { realSubmissionsEnabled, csrfToken } = useAuth();
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();

  const [incoming, setIncoming] = useState<IntroductionSummary[] | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingRequestItem[] | null>(null);
  const [dailyCap, setDailyCap] = useState(5);
  const [remaining, setRemaining] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!realSubmissionsEnabled) {
      setIncoming([]);
      setOutgoing([]);
      return;
    }
    let cancelled = false;
    void clientRef
      .current!.getIncomingRequests()
      .then((res) => !cancelled && setIncoming(res.requests))
      .catch(() => !cancelled && setIncoming([]));
    void clientRef
      .current!.getOutgoingRequests()
      .then((res) => {
        if (cancelled) return;
        setOutgoing(res.requests);
        setDailyCap(res.dailyCap);
        setRemaining(res.remainingToday);
      })
      .catch(() => !cancelled && setOutgoing([]));
    return () => {
      cancelled = true;
    };
  }, [realSubmissionsEnabled]);

  useEffect(() => load(), [load]);

  const respond = useCallback(
    (requestId: string, accept: boolean) => {
      if (!realSubmissionsEnabled) return;
      setBusy(requestId);
      if (accept) haptic("success");
      void clientRef
        .current!.respondToRequest(requestId, accept, csrfToken ?? "")
        .then(() => {
          setToast(accept ? "Introduction accepted — confirm with them next." : "Request declined quietly.");
          window.setTimeout(() => setToast(null), 2600);
          load();
        })
        .catch(() => {
          setToast("That request is no longer available.");
          window.setTimeout(() => setToast(null), 2600);
          load();
        })
        .finally(() => setBusy(null));
    },
    [realSubmissionsEnabled, csrfToken, load],
  );

  const loading = incoming === null || outgoing === null;

  return (
    <main className="screen standard-screen">
      <header className="topbar">
        <button type="button" className="back-button" aria-label="Back" onClick={onBack}><ChevronLeftIcon size={22} /></button>
        <span className="header-label" style={{ flex: 1, textAlign: "center" }}>Introductions</span>
        <span style={{ width: 36 }} />
      </header>

      <section className="page-intro">
        <span className="section-kicker">Intentional, not endless</span>
        <h1>Introductions</h1>
        <p>A request is a deliberate step from your private shortlist. You can send up to {dailyCap} a day. Requests expire after 72 hours, and no one is told if they are declined.</p>
      </section>

      <div className="privacy-strip" style={{ marginBottom: 16 }}>
        <ShieldCheckIcon size={16} /><span>{remaining} of {dailyCap} requests left today</span>
      </div>

      {loading ? (
        <section className="status-card pending-card" aria-label="Loading requests">
          <div className="status-icon amber"><ClockIcon /></div>
          <div className="status-copy"><span>Loading</span><strong>Checking your introductions…</strong></div>
        </section>
      ) : (
        <>
          <h2 className="list-heading">Incoming requests</h2>
          {incoming.length === 0 ? (
            <section className="process-card">
              <p className="quiet-copy">No pending requests. When someone sends you an introduction, their values-only summary appears here — never their name, photo, or contact details.</p>
            </section>
          ) : (
            incoming.map((req) => (
              <section key={req.requestId} className="request-card status-card pending-card">
                <div className="request-summary">
                  <div className="summary-chips">
                    <span>{req.profile.age} yrs</span>
                    <span>{req.profile.city || "Ethiopia"}</span>
                    <span>{req.profile.gender === "male" ? "Brother" : "Sister"}</span>
                    <span className="code-chip">{req.profile.publicCode}</span>
                  </div>
                  <ul className="summary-basics">
                    <li><strong>Marriage goal</strong><span>{marriageLabel(req.profile.marriageIntention)}</span></li>
                    <li><strong>Education</strong><span>{req.profile.educationLevel ? req.profile.educationLevel.replaceAll("_", " ") : "—"}</span></li>
                    <li><strong>Work</strong><span>{req.profile.occupationCategory || "—"}</span></li>
                    <li><strong>Godfather</strong><span>{req.profile.hasGodfather ? "Yes" : "No"}</span></li>
                    <li><strong>Deacon</strong><span>{deaconLabel(req.profile.isDeacon)}</span></li>
                    <li><strong>Active in church service</strong><span>{req.profile.churchServiceActive ? "Yes" : "No"}</span></li>
                  </ul>
                  {req.profile.bio && <p className="summary-bio">“{req.profile.bio}”</p>}
                  <div className="summary-values">
                    {req.profile.values.map((value) => <span key={value} className="value-pill">{value.replaceAll("_", " ")}</span>)}
                  </div>
                </div>
                <div className="connection-actions">
                  <button
                    type="button"
                    className="primary-button connection-button"
                    disabled={busy === req.requestId}
                    onClick={() => respond(req.requestId, true)}
                  >
                    <CheckIcon size={16} /> Accept
                  </button>
                  <button
                    type="button"
                    className="secondary-button connection-button"
                    disabled={busy === req.requestId}
                    onClick={() => respond(req.requestId, false)}
                    aria-label="Decline request quietly"
                  >
                    <XIcon size={16} /> Decline
                  </button>
                </div>
                <p className="quiet-note" style={{ margin: "10px 0 0" }}>
                  <LockIcon size={15} /> <span>Declining is silent — they simply won’t hear back. Accepting lets both of you confirm before an administrator reviews.</span>
                </p>
              </section>
            ))
          )}

          <h2 className="list-heading">Your shortlist · sent requests</h2>
          {outgoing.length === 0 ? (
            <section className="process-card">
              <p className="quiet-copy">You haven’t sent any introduction requests yet. Right-swipe someone on Discover to add them to your private shortlist, then send a request from there.</p>
            </section>
          ) : (
            outgoing.map((req) => (
              <section key={req.requestId} className="status-card pending-card outgoing-card">
                <div className="status-icon amber"><ClockIcon /></div>
                <div className="status-copy">
                  <span>{req.status === "accepted" ? "Accepted — waiting on confirmations" : "Request sent"}</span>
                  <strong>{req.recipient.age} • {req.recipient.city || "Ethiopia"} • {req.recipient.publicCode}</strong>
                  <p>{req.status === "accepted"
                    ? "They accepted. Both of you confirm next, then an administrator approves."
                    : "They can review your values-only summary. You’ll see it here if they accept — otherwise it quietly expires."}</p>
                </div>
              </section>
            ))
          )}
        </>
      )}

      <div className="quiet-note"><LockIcon size={17} /><p>Your shortlist is private. Kidan never notifies anyone from a swipe, and never reveals a decline.</p></div>

      {toast && <div className="toast" role="status"><ShieldCheckIcon size={17} /> {toast}</div>}
    </main>
  );
}

function marriageLabel(intention: string): string {
  switch (intention) {
    case "teklil": return "Teklil · Holy Matrimony";
    case "kidusan_kurban": return "Kidusan Kurban · Holy Communion";
    case "either": return "Either / open";
    default: return intention.replaceAll("_", " ");
  }
}

function deaconLabel(isDeacon: boolean | null): string {
  if (isDeacon === null) return "Not asked";
  return isDeacon ? "Yes" : "No";
}
