import { useCallback, useEffect, useState } from "react";
import type { AdminPendingConnection, AdminQueueItem, FunnelMetrics } from "@kidan/contracts";
import { AdminApiClient, AdminApiError } from "../api/client.js";

interface FunnelPanelProps {
  client: AdminApiClient;
  onError: (message: string | null) => void;
  /** Opens a candidate's submission in the review detail panel. */
  openSubmission?: (publicCode: string) => void;
}

type TabId = "summary" | "submissions" | "requests" | "connections";

/** Track E2: pilot funnel metrics + actionable review. Counts only; never identities. */
export function FunnelPanel({ client, onError, openSubmission }: FunnelPanelProps) {
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null);
  const [roster, setRoster] = useState<AdminQueueItem[] | null>(null);
  const [pendingConnections, setPendingConnections] = useState<AdminPendingConnection[] | null>(null);
  const [busyConnection, setBusyConnection] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("summary");

  const refresh = useCallback(async () => {
    try {
      const [m, r, c] = await Promise.all([
        client.getFunnelMetrics(),
        client.listAll(),
        client.listPendingConnections().catch(() => []),
      ]);
      setMetrics(m);
      setRoster(r);
      setPendingConnections(c);
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 401) return;
      onError(caught instanceof AdminApiError ? `Metrics unavailable (${caught.code}).` : "Metrics unavailable.");
    }
  }, [client, onError]);

  const decideConnection = useCallback(async (id: string, decision: "approved" | "rejected") => {
    setBusyConnection(id);
    try {
      await client.decideConnection(id, decision);
      await refresh();
    } catch (caught) {
      onError(caught instanceof AdminApiError ? `Decision failed (${caught.code}).` : "Decision failed.");
    } finally {
      setBusyConnection(null);
    }
  }, [client, onError, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="funnel-panel" aria-label="Pilot funnel metrics">
      <div className="queue-head">
        <h2>
          <Icon name="funnel" /> Funnel
        </h2>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {metrics === null ? (
        <p className="muted">Loading metrics…</p>
      ) : (
        <div className="funnel-body">
          <nav className="funnel-tabs" role="tablist" aria-label="Funnel views">
            <TabButton id="summary" active={tab} onSelect={setTab} icon="summary" label="Summary" />
            <TabButton id="submissions" active={tab} onSelect={setTab} icon="submission" label="Submissions" />
            <TabButton id="requests" active={tab} onSelect={setTab} icon="request" label="Requests" />
            <TabButton id="connections" active={tab} onSelect={setTab} icon="connection" label="Connections" />
          </nav>

          <div className="funnel-content" role="tabpanel">
            {tab === "summary" && <SummaryView metrics={metrics} />}
            {tab === "submissions" && (
              <SubmissionsView metrics={metrics} roster={roster} open={openSubmission} />
            )}
            {tab === "requests" && <RequestsView metrics={metrics} />}
            {tab === "connections" && (
              <ConnectionsView metrics={metrics} pending={pendingConnections} busy={busyConnection} onDecide={decideConnection} />
            )}
          </div>

          <p className="funnel-note">Aggregate counts only — no candidate identity is shown or logged.</p>
        </div>
      )}
    </section>
  );
}

/* ---- views ---- */

function SummaryView({ metrics }: { metrics: FunnelMetrics }) {
  const total = metrics.cohort.submitted + metrics.cohort.approved;
  const admitRate = metrics.cohort.submitted > 0
    ? Math.round((metrics.cohort.approved / metrics.cohort.submitted) * 100)
    : 0;
  return (
    <div className="funnel-grid">
      <StatCard icon="submission" label="Submitted" value={metrics.cohort.submitted} hint="Total candidates" />
      <StatCard icon="check" label="Approved" value={metrics.cohort.approved} hint="Active in cohort" highlight />
      <StatCard icon="heart" label="Shortlisted" value={metrics.discovery.shortlisted} hint="Interest swipes" />
      <StatCard icon="stack" label="Admission rate" value={`${admitRate}%`} hint={total > 0 ? "Approved / submitted" : "Awaiting data"} />
    </div>
  );
}

function SubmissionsView({ metrics, roster, open }: {
  metrics: FunnelMetrics;
  roster: AdminQueueItem[] | null;
  open?: (publicCode: string) => void;
}) {
  const pending = roster?.filter((r) => r.reviewStatus === "pending" || r.reviewStatus === "changes_requested").length ?? metrics.cohort.submitted - metrics.cohort.approved;
  const hasOpen = typeof open === "function";
  return (
    <div className="funnel-submissions">
      <div className="funnel-grid funnel-grid-compact">
        <StatCard icon="submission" label="Submitted" value={metrics.cohort.submitted} hint="Total" />
        <StatCard icon="check" label="Approved" value={metrics.cohort.approved} hint="Admitted" highlight />
        <StatCard icon="hourglass" label="In review" value={pending} hint="Not yet decided" />
      </div>

      <div className="funnel-list-head">
        <span>{roster === null ? "Loading applicants…" : `${roster.length} applicants`}</span>
        {hasOpen ? <span className="funnel-list-hint">Tap to open &amp; review</span> : null}
      </div>

      {roster === null ? (
        <p className="muted small">Loading applicants…</p>
      ) : roster.length === 0 ? (
        <div className="funnel-empty">
          <Icon name="check" />
          <span>No applicants yet. New submissions appear here.</span>
        </div>
      ) : (
        <ul className="funnel-list">
          {roster.map((item) => (
            <li key={item.publicCode}>
              <button
                type="button"
                className="funnel-item"
                onClick={() => hasOpen && open(item.publicCode)}
              >
                <span className="funnel-item-code">{item.publicCode}</span>
                <span className="funnel-item-age">{item.age}</span>
                <span className={`review-dot ${statusClass(item.reviewStatus)}`}>{statusLabel(item.reviewStatus)}</span>
                <span className="funnel-item-spacer" />
                {hasOpen ? <Icon name="chevron" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusClass(status: AdminQueueItem["reviewStatus"]): string {
  if (status === "approved") return "is-approved";
  if (status === "rejected") return "is-rejected";
  if (status === "changes_requested") return "is-changes";
  return "is-pending";
}
function statusLabel(status: AdminQueueItem["reviewStatus"]): string {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "changes_requested") return "Changes";
  return "Pending";
}

function RequestsView({ metrics }: { metrics: FunnelMetrics }) {
  return (
    <div className="funnel-grid">
      <StatCard icon="pending" label="Pending" value={metrics.requests.pending} hint="Open requests" />
      <StatCard icon="check" label="Accepted" value={metrics.requests.accepted} hint="Reached connection" highlight />
      <StatCard icon="decline" label="Declined" value={metrics.requests.declined} hint="Declined by recipient" />
      <StatCard icon="expired" label="Expired" value={metrics.requests.expired} hint="Past 72h window" />
    </div>
  );
}

function ConnectionsView({ metrics, pending, busy, onDecide }: {
  metrics: FunnelMetrics;
  pending: AdminPendingConnection[] | null;
  busy: string | null;
  onDecide: (id: string, decision: "approved" | "rejected") => void;
}) {
  return (
    <div className="funnel-connections">
      <div className="funnel-grid funnel-grid-compact">
        <StatCard icon="admin" label="With admin" value={metrics.connections.pendingAdmin} hint="Awaiting approval" highlight />
        <StatCard icon="check" label="Connected" value={metrics.connections.connected} hint="Matched" />
        <StatCard icon="decline" label="Declined" value={metrics.connections.declined} hint="A participant declined" />
        <StatCard icon="reject" label="Rejected" value={metrics.connections.rejected} hint="By administrator" />
      </div>

      <div className="funnel-list-head">
        <span>{pending === null ? "Loading connections…" : `${pending.length} awaiting approval`}</span>
        <span className="funnel-list-hint">Approve or reject below</span>
      </div>

      {pending === null ? (
        <p className="muted small">Loading connections…</p>
      ) : pending.length === 0 ? (
        <div className="funnel-empty">
          <Icon name="check" />
          <span>No introductions waiting. Approvals appear here.</span>
        </div>
      ) : (
        <ul className="funnel-list">
          {pending.map((connection) => (
            <li key={connection.id}>
              <div className="funnel-connection">
                <div className="funnel-connection-line">
                  <span className="funnel-item-code">{connection.userA.publicCode}</span>
                  <span className="funnel-item-age">{connection.userA.age}</span>
                  <span className="pair-join" aria-label="mutual interest">⇄</span>
                  <span className="funnel-item-code">{connection.userB.publicCode}</span>
                  <span className="funnel-item-age">{connection.userB.age}</span>
                  <span className="funnel-item-spacer" />
                </div>
                <div className="funnel-connection-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    disabled={busy === connection.id}
                    onClick={() => onDecide(connection.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small btn-danger"
                    disabled={busy === connection.id}
                    onClick={() => onDecide(connection.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---- atoms ---- */

function TabButton({ id, active, onSelect, label, icon }: {
  id: TabId;
  active: TabId;
  onSelect: (id: TabId) => void;
  label: string;
  icon: IconName;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      className={`funnel-tab ${active === id ? "is-active" : ""}`}
      onClick={() => onSelect(id)}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function StatCard({ icon, label, value, hint, highlight }: {
  icon: IconName;
  label: string;
  value: number | string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`funnel-stat ${highlight ? "is-highlight" : ""}`}>
      <span className="funnel-stat-icon"><Icon name={icon} /></span>
      <span className="funnel-stat-value">{value}</span>
      <span className="funnel-stat-label">{label}</span>
      {hint ? <span className="funnel-stat-hint">{hint}</span> : null}
    </div>
  );
}

/* ---- icons (inline SVG, no external resources) ---- */

type IconName =
  | "funnel" | "summary" | "submission" | "request" | "connection"
  | "check" | "heart" | "stack" | "hourglass" | "pending" | "decline" | "expired" | "admin" | "reject" | "chevron";

function Icon({ name }: { name: IconName }) {
  const paths: Partial<Record<IconName, string>> = {
    funnel: "M3 4h18l-7 8v6l-4 2v-8L3 4z",
    chevron: "M9 6l6 6-6 6",
    summary: "M4 6h16M4 12h16M4 18h10",
    submission: "M8 4v6m0 0-3-3m3 3 3-3M6 20h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z",
    request: "M9 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM9 9h6M9 13h6",
    connection: "M20 7l-4 4M4 17l4-4m-4-6 4 4 6-6 2 4 4 2-6 6 4 4",
    check: "M5 13l4 4L19 7",
    heart: "M12 20s-7-4.6-9.5-8.6C1 8.8 2.6 5 6 5c2 0 3.2 1.1 4 2.4C10.8 6.1 12 5 14 5c3.4 0 5 3.8 3.5 6.4C19 15.4 12 20 12 20z",
    stack: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
    hourglass: "M7 4h10M7 20h10M7 4c0 5 2 6 5 7-3 1-5 2-5 7M17 4c0 5-2 6-5 7 3 1 5 2 5 7",
    pending: "M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    decline: "M6 6l12 12M18 6L6 18",
    expired: "M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    admin: "M12 3l8 4v6c0 5-3.5 7.5-8 8-4.5-.5-8-3-8-8V7l8-4z",
    reject: "M12 9v6M12 5v.01M12 15a9 9 0 1 0 0 0a9 9 0 0 0 0 0z",
  };
  const d = paths[name] ?? paths.funnel!;
  return (
    <svg className="funnel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
