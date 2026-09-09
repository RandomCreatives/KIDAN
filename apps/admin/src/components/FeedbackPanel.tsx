import { useCallback, useEffect, useState } from "react";
import type { FeedbackItem } from "@kidan/contracts";
import { AdminApiClient } from "../api/client.js";

interface FeedbackPanelProps {
  client: AdminApiClient;
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
}

const KIND_LABEL: Record<FeedbackItem["kind"], string> = {
  report: "Report",
  feedback: "Feedback",
  comment: "Comment",
};

/**
 * Operator hamburger-drawer: lists ALL candidate feedback / comments /
 * concerns newest-first, with an unread badge and a "mark read" action.
 * Shows the public code (KD-XXXXXX) only — never a name or photo.
 */
export function FeedbackPanel({ client, open, onClose, onError }: FeedbackPanelProps) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await client.listFeedback();
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Failed to load feedback");
    }
  }, [client, onError]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        await client.markFeedbackRead(id);
        await refresh();
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : "Failed to update");
      } finally {
        setBusy(null);
      }
    },
    [client, refresh, onError],
  );

  return (
    <div className={`drawer-overlay ${open ? "is-open" : ""}`} onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <h2>Feedback</h2>
          {unreadCount > 0 ? <span className="count-badge">{unreadCount}</span> : null}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            Close
          </button>
        </div>

        {items === null ? (
          <p className="muted">Loading feedback…</p>
        ) : items.length === 0 ? (
          <div className="funnel-empty">
            <p>No feedback yet. Candidate reports, feedback and comments appear here.</p>
          </div>
        ) : (
          <ul className="feedback-list">
            {items.map((item) => (
              <li key={item.id} className={`feedback-item ${item.readAt ? "" : "is-unread"}`}>
                <div className="feedback-item-top">
                  <span className="feedback-kind">{KIND_LABEL[item.kind]}</span>
                  <span className="feedback-code">{item.publicCode}</span>
                  <span className="feedback-date">{formatDate(item.createdAt)}</span>
                </div>
                <p>{item.body}</p>
                <div className="feedback-item-actions">
                  {item.readAt ? (
                    <span className="feedback-read">Read</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      disabled={busy === item.id}
                      onClick={() => void markRead(item.id)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
