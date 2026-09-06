import { useCallback, useEffect, useRef, useState } from "react";
import { KidanApiClient } from "../api/client.js";
import type { CandidateReviewStatus } from "@kidan/contracts";

interface ReviewStatusCardProps {
  /**
   * The component only makes network calls when real submissions are enabled
   * (the demo/prototype mode makes none). When disabled it renders nothing.
   */
  enabled: boolean;
  /** Re-fetch trigger (e.g. increment after submitting). */
  refreshKey?: number;
}

type State =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "status"; status: CandidateReviewStatus };

const copy: Record<
  CandidateReviewStatus["status"],
  { title: string; body: string; tone: "pending" | "approved" | "action" | "rejected" }
> = {
  pending: {
    title: "In private review",
    body: "An administrator is privately verifying your identity and reviewing your public profile. You will be notified here.",
    tone: "pending",
  },
  approved: {
    title: "Approved",
    body: "Your profile is approved and live for values-only discovery. Your name, phone, and photo stay hidden.",
    tone: "approved",
  },
  changes_requested: {
    title: "Update requested",
    body: "An administrator asked for a small change before your profile can be published. Review the private note below and resubmit.",
    tone: "action",
  },
  rejected: {
    title: "Review result",
    body: "Your profile could not be approved for this pilot. See the private note below. Your details remain hidden and are not published.",
    tone: "rejected",
  },
};

export function ReviewStatusCard({ enabled, refreshKey = 0 }: ReviewStatusCardProps) {
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();
  const [state, setState] = useState<State>({ kind: enabled ? "loading" : "hidden" });

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ kind: "hidden" });
      return;
    }
    try {
      const status = await clientRef.current!.getReviewStatus();
      // Never surface a card for a candidate who has not submitted; the
      // onboarding flow owns that state.
      if (status.status === "pending" && status.feedbackNote === null && status.decidedAt === null) {
        setState({ kind: "hidden" });
        return;
      }
      setState({ kind: "status", status });
    } catch {
      // Network/transient errors must not render a scary state; stay hidden.
      setState({ kind: "hidden" });
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (state.kind !== "status") return null;
  const { status } = state;
  const view = copy[status.status];

  return (
    <section className={`review-status-card review-tone-${view.tone}`} aria-live="polite">
      <div className="review-status-head">
        <span className={`review-dot review-dot-${view.tone}`} aria-hidden="true" />
        <strong>{view.title}</strong>
      </div>
      <p className="review-status-body">{view.body}</p>
      {status.feedbackNote ? (
        <div className="review-note">
          <span className="review-note-label">Private note</span>
          <p>{status.feedbackNote}</p>
        </div>
      ) : null}
      {status.status === "changes_requested" ? (
        <p className="review-hint">Reopen your profile below, make the change, and submit again.</p>
      ) : null}
    </section>
  );
}
