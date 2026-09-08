import { useCallback, useEffect, useState } from "react";
import type { FunnelMetrics } from "@kidan/contracts";
import { AdminApiClient, AdminApiError } from "../api/client.js";

interface FunnelPanelProps {
  client: AdminApiClient;
  onError: (message: string | null) => void;
}

/**
 * Track E2: pilot funnel metrics. Aggregate counts only; never identities,
 * codes, or personal data. Renders a compact, uncluttered readout.
 */
export function FunnelPanel({ client, onError }: FunnelPanelProps) {
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMetrics(await client.getFunnelMetrics());
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 401) return;
      onError(caught instanceof AdminApiError ? `Metrics unavailable (${caught.code}).` : "Metrics unavailable.");
    }
  }, [client, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="funnel-panel" aria-label="Pilot funnel metrics">
      <div className="queue-head">
        <h2>Funnel (all-time)</h2>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {metrics === null ? (
        <p className="muted">Loading metrics…</p>
      ) : (
        <>
          <div className="funnel-stages" aria-label="Cohort and discovery counts">
            <FunnelStat label="Submitted" value={metrics.cohort.submitted} />
            <FunnelStat label="Approved" value={metrics.cohort.approved} />
            <FunnelStat label="Shortlisted" value={metrics.discovery.shortlisted} />
          </div>
          <div className="funnel-stages" aria-label="Introduction requests">
            <FunnelStat label="Pending" value={metrics.requests.pending} />
            <FunnelStat label="Accepted" value={metrics.requests.accepted} />
            <FunnelStat label="Declined" value={metrics.requests.declined} />
            <FunnelStat label="Expired" value={metrics.requests.expired} />
          </div>
          <div className="funnel-stages" aria-label="Connections">
            <FunnelStat label="With admin" value={metrics.connections.pendingAdmin} />
            <FunnelStat label="Connected" value={metrics.connections.connected} />
            <FunnelStat label="Declined" value={metrics.connections.declined} />
            <FunnelStat label="Rejected" value={metrics.connections.rejected} />
          </div>
          <p className="funnel-note">Aggregate counts only — no candidate identity is shown or logged.</p>
        </>
      )}
    </section>
  );
}

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="funnel-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
