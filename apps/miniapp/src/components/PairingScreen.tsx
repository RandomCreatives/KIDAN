import { useCallback, useEffect, useRef, useState } from "react";
import type { PairingJourneyView, RevealedCounterpart } from "@kidan/contracts";
import { KidanApiClient } from "../api/client.js";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { ArrowLeftIcon, CheckIcon, ClockIcon, EyeIcon, HeartIcon, LockIcon, ShieldCheckIcon, XIcon } from "./Icons";

interface PairingScreenProps {
  connectionId: string;
  onBack: () => void;
}

type Phase =
  | { kind: "loading" }
  | { kind: "journey"; view: PairingJourneyView }
  | { kind: "primer" }
  | { kind: "waiting_confirm" }
  | { kind: "revealed"; counterpart: RevealedCounterpart }
  | { kind: "closed"; followupDueAt: string }
  | { kind: "together" }
  | { kind: "error"; message: string };

type Pending = "ready" | "not_yet" | "confirm" | "keep" | "close" | "together" | null;

function gateCopy(view: PairingJourneyView): { title: string; detail: string } | null {
  if (view.gate.gateMet) return null;
  const parts: string[] = [];
  if (view.gate.daysRemaining > 0) {
    parts.push(`${view.gate.daysRemaining} more day${view.gate.daysRemaining === 1 ? "" : "s"}`);
  }
  if (view.gate.messagesRemaining > 0) {
    parts.push(`${view.gate.messagesRemaining} more message${view.gate.messagesRemaining === 1 ? "" : "s"} between you`);
  }
  return {
    title: "Keep getting to know each other",
    detail: `The next step unlocks after ${parts.join(" and ")} — the bot will ask you both when it's time.`,
  };
}

function readinessCopy(view: PairingJourneyView): { title: string; detail: string } {
  if (view.readiness.selfReady && view.readiness.otherReady) {
    return { title: "You're both ready", detail: "One final simultaneous step and the reveal begins." };
  }
  if (view.readiness.selfReady) {
    return { title: "Waiting on their heart", detail: "You've said ready. They'll answer the same question in their own time." };
  }
  if (view.readiness.otherReady) {
    return { title: `${view.counterpartCode} is ready when you are`, detail: "They've said ready for the next step. There's no pressure — answer honestly." };
  }
  if (view.readiness.notYetCycles > 0) {
    return { title: "Not yet is a good answer", detail: "Take the time you need. We'll keep checking in gently." };
  }
  return { title: "Are you ready for the next step?", detail: "Ready means you're open to meeting this person. Not yet keeps things exactly as they are." };
}

/**
 * Kidan Completion — the pairing journey screen (docs/KIDAN_COMPLETION.md §8).
 *
 * The candidate-facing moment of the post-match journey: the readiness loop,
 * the final primer and simultaneous reveal, the respectful close, and the
 * "Together" self-report. Everything here stays honest about state: the
 * journey snapshot is re-fetched after every transition, and the full
 * journey view on /v1/pairings/:connectionId never carries identity material.
 */
export function PairingScreen({ connectionId, onBack }: PairingScreenProps) {
  const { csrfToken } = useAuth();
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);

  const refresh = useCallback(async (): Promise<PairingJourneyView | null> => {
    try {
      return await clientRef.current!.getPairingJourney(connectionId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PAIRING_NOT_FOUND") {
        setPhase({ kind: "error", message: "This pairing is not visible here. It may have been closed by an administrator." });
      } else {
        setPhase({ kind: "error", message: "We couldn't load your journey right now. Please try again." });
      }
      return null;
    }
  }, [connectionId]);

  const applyView = useCallback((view: PairingJourneyView) => {
    if (view.stage === "decoupled") {
      setPhase({ kind: "closed", followupDueAt: "" });
    } else if (view.stage === "completed_together") {
      setPhase({ kind: "together" });
    } else if (view.stage === "revealed") {
      setPhase((current) => (current.kind === "revealed" ? current : { kind: "journey", view }));
    } else {
      setPhase({ kind: "journey", view });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh().then((view) => {
      if (!cancelled && view) applyView(view);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, applyView]);

  const run = useCallback(
    async (action: Pending, fn: () => Promise<unknown>) => {
      setPending(action);
      setError(null);
      try {
        await fn();
      } catch (err) {
        haptic("warning");
        setError(
          err instanceof ApiError && err.code === "GATE_NOT_MET"
            ? "Not just yet — the bot will ask again soon."
            : err instanceof ApiError && err.code === "ALREADY_CLOSED"
              ? "This pairing has already been closed."
              : "Something didn't complete. Nothing is lost — please try again.",
        );
      } finally {
        setPending(null);
      }
    },
    [],
  );

  const answerReadiness = useCallback(
    (answer: "ready" | "not_yet") =>
      run(answer, async () => {
        const result = await clientRef.current!.answerPairingReadiness(connectionId, answer, csrfToken ?? "");
        if (result.state === "both_ready") {
          haptic("success");
          setPhase({ kind: "primer" });
          return;
        }
        const view = await refresh();
        if (view) applyView(view);
      }),
    [connectionId, csrfToken, refresh, applyView, run],
  );

  const confirmReveal = useCallback(
    () =>
      run("confirm", async () => {
        const result = await clientRef.current!.confirmPairingReveal(connectionId, csrfToken ?? "");
        if ("counterpart" in result) {
          haptic("success");
          setPhase({ kind: "revealed", counterpart: result.counterpart });
        } else {
          setPhase({ kind: "waiting_confirm" });
        }
      }),
    [connectionId, csrfToken, run],
  );

  const openRevealedIdentity = useCallback(() => {
    // Deliberate, on-purpose only: the unveiled identity is fetched and shown
    // solely after an explicit tap (spec §5: never as a side effect).
    void run(null, async () => {
      const counterpart = await clientRef.current!.getRevealedCounterpart(connectionId, true);
      setPhase({ kind: "revealed", counterpart });
    });
  }, [connectionId, run]);

  const close = useCallback(
    () =>
      run("close", async () => {
        const result = await clientRef.current!.closePairing(connectionId, undefined, csrfToken ?? "");
        setPhase({ kind: "closed", followupDueAt: result.followupDueAt });
        void refresh();
      }),
    [connectionId, csrfToken, run, refresh],
  );

  const together = useCallback(
    () =>
      run("together", async () => {
        await clientRef.current!.reportPairingTogether(connectionId, csrfToken ?? "");
        haptic("success");
        setPhase({ kind: "together" });
      }),
    [connectionId, csrfToken, run],
  );

  const currentView = phase.kind === "journey" ? phase.view : null;

  return (
    <main className="screen standard-screen pairing-screen">
      <header className="topbar">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={20} />
        </button>
        <Brand />
        <span className="header-label">Next step</span>
      </header>

      {phase.kind === "loading" && (
        <section className="status-card pending-card" aria-label="Loading journey">
          <div className="status-icon amber"><ClockIcon /></div>
          <div className="status-copy"><span>Loading</span><strong>Checking your journey…</strong></div>
        </section>
      )}

      {phase.kind === "error" && (
        <section className="status-card pending-card">
          <div className="status-icon muted"><LockIcon /></div>
          <div className="status-copy"><span>Not available</span><strong>{phase.message}</strong></div>
        </section>
      )}

      {currentView && (
        <>
          {currentView.stalled && (
            <section className="status-card pending-card pairing-stalled">
              <div className="status-icon amber"><ClockIcon /></div>
              <div className="status-copy">
                <span>A gentle note</span>
                <strong>This path has been quiet — a decision moves things forward either way.</strong>
                <p>Ready, not yet, or a respectful close are all honest answers.</p>
              </div>
            </section>
          )}

          {gateCopy(currentView) ? (
            <section className="status-card pending-card">
              <div className="status-icon amber"><ClockIcon /></div>
              <div className="status-copy">
                <span>Next step</span>
                <strong>{gateCopy(currentView)!.title}</strong>
                <p>{gateCopy(currentView)!.detail}</p>
              </div>
            </section>
          ) : currentView.readiness.primerStage !== "none" ? (
            <section className="status-card pending-card pairing-primer">
              <div className="status-icon green"><HeartIcon /></div>
              <div className="status-copy">
                <span>Almost there</span>
                <strong>
                  {currentView.readiness.primerStage === "awaiting_self"
                    ? "One last step from you"
                    : "One last step from them"}
                </strong>
                {currentView.readiness.primerStage === "awaiting_self" && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={pending === "confirm"}
                    onClick={confirmReveal}
                  >
                    <CheckIcon size={16} /> Ready to meet
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="status-card pending-card">
              <div className="status-icon green"><HeartIcon /></div>
              <div className="status-copy">
                <span>Readiness</span>
                <strong>{readinessCopy(currentView).title}</strong>
                <p>{readinessCopy(currentView).detail}</p>
                {!currentView.readiness.selfReady && (
                  <div className="pairing-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={pending !== null}
                      onClick={() => answerReadiness("ready")}
                    >
                      {pending === "ready" ? "Saving…" : "Yes, I'm ready"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={pending !== null}
                      onClick={() => answerReadiness("not_yet")}
                    >
                      {pending === "not_yet" ? "Saving…" : "Not yet"}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {currentView.stage === "revealed" && (
            <section className="status-card pending-card">
              <div className="status-icon green"><ShieldCheckIcon /></div>
              <div className="status-copy">
                <span>Identities revealed</span>
                <strong>This pairing has moved forward.</strong>
                <p>Their name and contact details are shown only when you choose to see them.</p>
                <div className="pairing-actions">
                  <button type="button" className="primary-button" disabled={pending !== null} onClick={openRevealedIdentity}>
                    <EyeIcon size={16} /> Show revealed identity
                  </button>
                  <button type="button" className="secondary-button" disabled={pending !== null} onClick={together}>
                    <HeartIcon size={16} /> We're together
                  </button>
                </div>
              </div>
            </section>
          )}

          {currentView.stage === "chatting" && (
            <section className="pairing-close-row">
              <button type="button" className="quiet-button" disabled={pending !== null} onClick={close}>
                <XIcon size={14} /> Close respectfully
              </button>
            </section>
          )}
        </>
      )}

      {phase.kind === "primer" && (
        <section className="status-card pending-card pairing-primer">
          <div className="status-icon green"><HeartIcon /></div>
          <div className="status-copy">
            <span>One last step</span>
            <strong>You're both ready.</strong>
            <p>
              When you each confirm, Kidan reveals your names and contact details to one another — at the same
              time, so no one is left waiting after revealing theirs.
            </p>
            <div className="pairing-actions">
              <button type="button" className="primary-button" disabled={pending === "confirm"} onClick={confirmReveal}>
                <CheckIcon size={16} /> {pending === "confirm" ? "Confirming…" : "I'm ready to meet them"}
              </button>
              <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void refresh().then((v) => v && applyView(v))}>
                Not yet — keep chatting
              </button>
            </div>
          </div>
        </section>
      )}

      {phase.kind === "waiting_confirm" && (
        <section className="status-card pending-card pairing-primer">
          <div className="status-icon amber"><ClockIcon /></div>
          <div className="status-copy">
            <span>Waiting</span>
            <strong>Waiting for them to confirm.</strong>
            <p>The moment they do, the reveal happens for you both at once. Nothing is shared until then.</p>
          </div>
        </section>
      )}

      {phase.kind === "revealed" && (
        <section className="status-card pending-card pairing-reveal">
          <div className="status-icon green"><ShieldCheckIcon /></div>
          <div className="status-copy">
            <span>The reveal</span>
            <strong>{phase.counterpart.legalName}</strong>
            <p>{phase.counterpart.publicCode} · {phase.counterpart.phone}</p>
            <p className="quiet-note">Reach out when you're both ready. Kindly, and at your own pace.</p>
            <div className="pairing-actions">
              <button type="button" className="primary-button" disabled={pending !== null} onClick={together}>
                <HeartIcon size={16} /> {pending === "together" ? "Saving…" : "We're together"}
              </button>
            </div>
          </div>
        </section>
      )}

      {phase.kind === "closed" && (
        <section className="status-card pending-card">
          <div className="status-icon muted"><ShieldCheckIcon /></div>
          <div className="status-copy">
            <span>Closed with care</span>
            <strong>This pairing has been respectfully closed.</strong>
            <p>
              {phase.followupDueAt
                ? `Kidan will check in with you once more around ${new Date(phase.followupDueAt).toLocaleDateString("en-ET", { day: "numeric", month: "long" })}.`
                : "Kidan will check in with you once more in a few days."}
              {" "}Thank you for trying with sincerity.
            </p>
          </div>
        </section>
      )}

      {phase.kind === "together" && (
        <section className="status-card pending-card pairing-reveal">
          <div className="status-icon green"><HeartIcon /></div>
          <div className="status-copy">
            <span>Kidane Mihret</span>
            <strong>You're walking forward together.</strong>
            <p>Kidan will quietly step back. May your path be blessed.</p>
          </div>
        </section>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="quiet-note">
        <LockIcon size={17} />
        <p>Closing a pairing is always possible and always kind. Identities are revealed only through the shared reveal, and shown only when you deliberately ask.</p>
      </div>
    </main>
  );
}

/**
 * The persistent "Next step" card embedded at the top of the chat thread
 * (docs/KIDAN_COMPLETION.md §8). It stays values-only by construction — it
 * renders only the journey snapshot's non-identity fields.
 */
export function PairingNextStepCard({
  connectionId,
  journey,
  onOpen,
  onRefresh,
}: {
  connectionId: string;
  journey: PairingJourneyView | null;
  onOpen: () => void;
  onRefresh?: () => void;
}) {
  void connectionId;
  void onRefresh;

  let title = "See your next step";
  let detail = "The readiness loop and reveal happen here — gentle, and always at both your paces.";
  let iconClass = "amber";

  if (journey) {
    if (journey.stage === "revealed") {
      title = "Identities revealed";
      detail = "Names and contact details were revealed together. Open to view — deliberately, when you choose.";
      iconClass = "green";
    } else if (journey.stage === "decoupled" || journey.stage === "completed_together") {
      return null;
    } else if (journey.readiness.primerStage !== "none") {
      title = journey.readiness.primerStage === "awaiting_self" ? "One last step from you" : "One last step from them";
      detail = "You're both ready — confirm to reveal your names to each other at the same time.";
      iconClass = "green";
    } else if (journey.readiness.otherReady && !journey.readiness.selfReady) {
      title = `${journey.counterpartCode} is ready when you are`;
      detail = "They're ready for the next step. Answer honestly — not yet is a good answer.";
      iconClass = "green";
    } else if (journey.readiness.selfReady && !journey.readiness.otherReady) {
      title = "Waiting on their answer";
      detail = "You've said ready. We'll let you know the moment they answer too.";
    } else if (!journey.gate.gateMet) {
      const parts: string[] = [];
      if (journey.gate.daysRemaining > 0) parts.push(`${journey.gate.daysRemaining}d`);
      if (journey.gate.messagesRemaining > 0) parts.push(`${journey.gate.messagesRemaining} messages`);
      title = "Getting to know each other";
      detail = `The next step unlocks after ${parts.join(" and ")} — keep chatting.`;
    } else if (journey.readiness.zombieReflectionDue) {
      title = "Where do you two stand?";
      detail = "A quiet moment to reflect — ready, not yet, or a respectful close are all honest answers.";
    }
  }

  return (
    <button type="button" className="status-card pending-card pairing-next-step" onClick={onOpen}>
      <div className={`status-icon ${iconClass}`}>
        {iconClass === "green" ? <HeartIcon /> : <ClockIcon />}
      </div>
      <div className="status-copy">
        <span>Next step</span>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </button>
  );
}
