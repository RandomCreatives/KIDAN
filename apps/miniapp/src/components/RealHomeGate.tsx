import { useCallback, useEffect, useRef, useState } from "react";
import type { CandidateReviewStatus } from "@kidan/contracts";
import { KidanApiClient } from "../api/client.js";
import { Brand } from "./Brand";
import { CheckIcon, LockIcon, ShieldCheckIcon } from "./Icons";

type GateState =
  | { kind: "loading" }
  | { kind: "pending" }
  | { kind: "changes_requested"; status: CandidateReviewStatus }
  | { kind: "rejected"; status: CandidateReviewStatus };

/**
 * Real (non-demo) home gate. After onboarding, a real candidate's access to
 * values-only discovery depends on their administrator review status:
 *  - approved              → parent shows the real Discover / Connections /
 *                            Profile tabs (onApproved fires)
 *  - pending / not decided → a "in private review" waiting screen
 *  - changes_requested     → actionable screen that reopens onboarding to edit
 *  - rejected              → a terminal private note screen
 * Replaces the prototype-era PilotDisabledScreen for live pilot users.
 */
export function RealHomeGate({
  onApproved,
  onResumeOnboarding,
}: {
  onApproved: () => void;
  onResumeOnboarding: () => void;
}) {
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();
  const [state, setState] = useState<GateState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const status = await clientRef.current!.getReviewStatus();
      if (status.status === "approved") {
        onApproved();
        return;
      }
      if (status.status === "rejected") {
        setState({ kind: "rejected", status });
        return;
      }
      if (status.status === "changes_requested") {
        setState({ kind: "changes_requested", status });
        return;
      }
      // "pending" with no decision yet. A candidate who has not actually
      // submitted a complete profile resumes onboarding rather than waiting.
      // The draft read is best-effort: if it cannot be loaded we keep the
      // waiting screen rather than bouncing the user around.
      try {
        const draft = await clientRef.current!.getDraft();
        if (draft?.submitted !== true) {
          onResumeOnboarding();
          return;
        }
      } catch {
        // ignore — treat as submitted (show waiting screen)
      }
      setState({ kind: "pending" });
    } catch {
      // Transient/network: show a neutral waiting state rather than an error.
      setState({ kind: "pending" });
    }
  }, [onApproved, onResumeOnboarding]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div className="centered">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  if (state.kind === "rejected") {
    return (
      <div className="onboarding-shell success-shell">
        <div className="gate-brand"><Brand /></div>
        <div className="success-mark review-tone-rejected"><ShieldCheckIcon size={30} /></div>
        <span className="section-kicker">Review result</span>
        <h1>Your profile could not be approved for this pilot</h1>
        <p>
          Your details remain hidden and are not published. You can review any
          private note below, or delete your account and all data from Privacy
          &amp; consent.
        </p>
        {state.status.feedbackNote ? (
          <div className="review-note">
            <span className="review-note-label">Private note</span>
            <p>{state.status.feedbackNote}</p>
          </div>
        ) : null}
      </div>
    );
  }

  if (state.kind === "changes_requested") {
    const note = state.status?.feedbackNote;
    return (
      <div className="onboarding-shell success-shell">
        <div className="gate-brand"><Brand /></div>
        <div className="success-mark review-tone-action"><CheckIcon size={30} /></div>
        <span className="section-kicker">Update requested</span>
        <h1>A small change is needed before your profile can be published</h1>
        <p>Review the private note below, reopen your profile, make the change, and submit again.</p>
        {note ? (
          <div className="review-note">
            <span className="review-note-label">Private note</span>
            <p>{note}</p>
          </div>
        ) : null}
        <button className="primary-button onboarding-primary" type="button" onClick={onResumeOnboarding}>
          Reopen profile
        </button>
      </div>
    );
  }

  // pending (submitted, awaiting or mid administrator review)
  return (
    <div className="onboarding-shell success-shell">
      <div className="gate-brand"><Brand /></div>
      <div className="success-mark"><ShieldCheckIcon size={30} /></div>
      <span className="section-kicker">In private review</span>
      <h1>Your profile is in for private review</h1>
      <p>
        An administrator is privately verifying your identity and reviewing your
        public profile. You will be notified here when it is approved. Your
        name, phone, photo, and contact details stay hidden throughout.
      </p>
      <div className="success-promise">
        <LockIcon size={18} />
        <p>Your verification photo is admin-only and is deleted 30 days after approval.</p>
      </div>
      <button className="primary-button onboarding-primary" type="button" onClick={() => void load()}>
        Refresh status
      </button>
    </div>
  );
}
