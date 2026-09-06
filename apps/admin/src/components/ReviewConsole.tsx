import { useCallback, useEffect, useState } from "react";
import type { AdminQueueItem, AdminSubmissionDetail } from "@kidan/contracts";
import { AdminApiClient, AdminApiError } from "../api/client.js";
import { SubmissionDetail } from "./SubmissionDetail.js";

interface ReviewConsoleProps {
  client: AdminApiClient;
  label: string;
  onLogout: () => Promise<void>;
}

export function ReviewConsole({ client, label, onLogout }: ReviewConsoleProps) {
  const [items, setItems] = useState<AdminQueueItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminSubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const refreshQueue = useCallback(async () => {
    setError(null);
    try {
      const queue = await client.listQueue();
      setItems(queue);
      return queue;
    } catch (caught) {
      setError(messageFor(caught));
      return null;
    }
  }, [client]);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  const openSubmission = useCallback(
    async (publicCode: string) => {
      setSelected(publicCode);
      setDetail(null);
      setLoadingDetail(true);
      setError(null);
      try {
        setDetail(await client.getSubmission(publicCode));
      } catch (caught) {
        setError(messageFor(caught));
        setSelected(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [client],
  );

  const handleDecided = useCallback(async () => {
    setDetail(null);
    setSelected(null);
    await refreshQueue();
  }, [refreshQueue]);

  const pendingCount = items?.length ?? 0;

  return (
    <div className="console">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-cross">✦</span>
          <div>
            <strong>Kidan</strong>
            <span className="topbar-sub">Review Console</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="operator">{label}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="queue-panel">
          <div className="queue-head">
            <h2>Pending review</h2>
            <span className="count-badge">{pendingCount}</span>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void refreshQueue()}>
              Refresh
            </button>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          {items === null ? (
            <p className="muted">Loading queue…</p>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <p>✓</p>
              <p>Nothing waiting for review.</p>
            </div>
          ) : (
            <ul className="queue-list">
              {items.map((item) => (
                <li key={item.publicCode}>
                  <button
                    type="button"
                    className={`queue-item ${selected === item.publicCode ? "is-selected" : ""}`}
                    onClick={() => void openSubmission(item.publicCode)}
                  >
                    <div className="queue-item-top">
                      <span className="code">{item.publicCode}</span>
                      <span className="pill">{item.gender === "male" ? "♂" : "♀"} · {item.age}</span>
                    </div>
                    <div className="queue-item-meta">
                      <span>{item.city}</span>
                      <span className={item.hasPhoto ? "photo-ok" : "photo-missing"}>
                        {item.hasPhoto ? "Photo on file" : "No photo"}
                      </span>
                    </div>
                    <div className="queue-item-date">{formatDate(item.submittedAt)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="detail-panel">
          {loadingDetail ? (
            <p className="muted centered-pad">Loading submission…</p>
          ) : detail ? (
            <SubmissionDetail
              key={detail.publicCode}
              client={client}
              detail={detail}
              onDecided={handleDecided}
              onError={setError}
            />
          ) : (
            <div className="detail-placeholder">
              <span className="brand-cross large">✦</span>
              <p>Select a candidate to review their private details and verification photo.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function messageFor(caught: unknown): string {
  if (caught instanceof AdminApiError) {
    if (caught.code === "NETWORK") return "Network error — the service could not be reached.";
    if (caught.status === 401) return "Your session expired. Please sign in again.";
    if (caught.code === "FEEDBACK_REQUIRED") return "A feedback note is required for this decision.";
    if (caught.code === "SUBMISSION_NOT_PENDING") return "This submission was already decided.";
    return `Request failed (${caught.code}).`;
  }
  return "Something went wrong.";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
