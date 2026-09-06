import { useCallback, useEffect, useState } from "react";
import type { AdminPendingConnection } from "@kidan/contracts";
import type { AdminApiClient } from "../api/client.js";
import { AdminApiError } from "../api/client.js";

interface ConnectionsPanelProps {
  client: AdminApiClient;
  onError: (message: string) => void;
}

/**
 * Track D: administrator approval queue for mutual-interest connections.
 * Values-only by design — the operator sees public code, age, city, gender,
 * never a name, phone, photo, or Telegram identity.
 */
export function ConnectionsPanel({ client, onError }: ConnectionsPanelProps) {
  const [connections, setConnections] = useState<AdminPendingConnection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConnections(await client.listPendingConnections());
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.code === "SERVICE_NOT_READY") {
        setConnections([]);
      } else {
        onError(messageFor(caught));
      }
    }
  }, [client, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = useCallback(
    async (id: string, decision: "approved" | "rejected") => {
      setBusy(id);
      try {
        await client.decideConnection(id, decision);
        await refresh();
      } catch (caught) {
        onError(messageFor(caught));
      } finally {
        setBusy(null);
      }
    },
    [client, onError, refresh],
  );

  if (connections === null) return null;
  if (connections.length === 0) return null;

  return (
    <div className="connections-panel">
      <div className="queue-head">
        <h2>Introductions awaiting approval</h2>
        <span className="count-badge">{connections.length}</span>
      </div>
      <p className="muted small">
        Two people independently chose each other. Approve to let both confirm the introduction; reject and neither is told a match existed.
      </p>
      <ul className="queue-list">
        {connections.map((connection) => (
          <li key={connection.id}>
            <div className="connection-item">
              <div className="connection-pair">
                <span className="code">{connection.userA.publicCode}</span>
                <span className="pill">{connection.userA.gender === "male" ? "♂" : "♀"} · {connection.userA.age} · {connection.userA.city}</span>
                <span className="pair-join" aria-label="mutual interest">⇄</span>
                <span className="code">{connection.userB.publicCode}</span>
                <span className="pill">{connection.userB.gender === "male" ? "♂" : "♀"} · {connection.userB.age} · {connection.userB.city}</span>
              </div>
              <div className="connection-decide">
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  disabled={busy === connection.id}
                  onClick={() => void decide(connection.id, "approved")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small btn-danger"
                  disabled={busy === connection.id}
                  onClick={() => void decide(connection.id, "rejected")}
                >
                  Reject
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function messageFor(caught: unknown): string {
  if (caught instanceof AdminApiError) {
    if (caught.code === "NETWORK") return "Network error — the service could not be reached.";
    if (caught.status === 401) return "Your session expired. Please sign in again.";
    if (caught.code === "CONNECTION_NOT_PENDING") return "This introduction was already decided.";
    return `Request failed (${caught.code}).`;
  }
  return "Something went wrong.";
}
