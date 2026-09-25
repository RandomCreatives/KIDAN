import { useCallback, useEffect, useRef, useState } from "react";
import type { PairingJourneyView, RevealedCounterpart } from "@kidan/contracts";
import { KidanApiClient } from "../api/client.js";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { ArrowLeftIcon, CheckIcon, ClockIcon, EyeIcon, HeartIcon, LockIcon, ShieldCheckIcon, XIcon } from "./Icons";
import { useI18n, useT } from "../i18n/LanguageProvider";

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

function gateCopy(view: PairingJourneyView, t: (k: string, v?: Record<string, string | number>) => string): { title: string; detail: string } | null {
  if (view.gate.gateMet) return null;
  const parts: string[] = [];
  if (view.gate.daysRemaining > 0) {
    parts.push(view.gate.daysRemaining === 1 ? t("{n} more day", { n: view.gate.daysRemaining }) : t("{n} more days", { n: view.gate.daysRemaining }));
  }
  if (view.gate.messagesRemaining > 0) {
    parts.push(view.gate.messagesRemaining === 1 ? t("{n} more message between you", { n: view.gate.messagesRemaining }) : t("{n} more messages between you", { n: view.gate.messagesRemaining }));
  }
  return {
    title: t("Keep getting to know each other"),
    detail: t("The next step unlocks after {parts} — the bot will ask you both when it's time.", { parts: parts.join(` ${t("and")} `) }),
  };
}

function readinessCopy(view: PairingJourneyView, t: (k: string, v?: Record<string, string | number>) => string): { title: string; detail: string } {
  if (view.readiness.selfReady && view.readiness.otherReady) {
    return { title: t("You're both ready"), detail: t("One final simultaneous step and the reveal begins.") };
  }
  if (view.readiness.selfReady) {
    return { title: t("Waiting on their heart"), detail: t("You've said ready. They'll answer the same question in their own time.") };
  }
  if (view.readiness.otherReady) {
    return { title: t("{code} is ready when you are", { code: view.counterpartCode }), detail: t("They've said ready for the next step. There's no pressure — answer honestly.") };
  }
  if (view.readiness.notYetCycles > 0) {
    return { title: t("Not yet is a good answer"), detail: t("Take the time you need. We'll keep checking in gently.") };
  }
  return { title: t("Are you ready for the next step?"), detail: t("Ready means you're open to meeting this person. Not yet keeps things exactly as they are.") };
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
  const { t, lang } = useI18n();
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
        setPhase({ kind: "error", message: t("This pairing is not visible here. It may have been closed by an administrator.") });
      } else {
        setPhase({ kind: "error", message: t("We couldn't load your journey right now. Please try again.") });
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
            ? t("Not just yet — the bot will ask again soon.")
            : err instanceof ApiError && err.code === "ALREADY_CLOSED"
              ? t("This pairing has already been closed.")
              : t("Something didn't complete. Nothing is lost — please try again."),
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
        <button type="button" className="icon-button" onClick={onBack} aria-label={t("Back")}>
          <ArrowLeftIcon size={20} />
        </button>
        <Brand />
        <span className="header-label">{t("Next step")}</span>
      </header>

      {phase.kind === "loading" && (
        <section className="status-card pending-card" aria-label={t("Loading journey")}>
          <div className="status-icon amber"><ClockIcon /></div>
          <div className="status-copy"><span>{t("Loading")}</span><strong>{t("Checking your journey…")}</strong></div>
        </section>
      )}

      {phase.kind === "error" && (
        <section className="status-card pending-card">
          <div className="status-icon muted"><LockIcon /></div>
          <div className="status-copy"><span>{t("Not available")}</span><strong>{phase.message}</strong></div>
        </section>
      )}

      {currentView && (
        <>
          {currentView.stalled && (
            <section className="status-card pending-card pairing-stalled">
              <div className="status-icon amber"><ClockIcon /></div>
              <div className="status-copy">
                <span>{t("A gentle note")}</span>
                <strong>{t("This path has been quiet — a decision moves things forward either way.")}</strong>
                <p>{t("Ready, not yet, or a respectful close are all honest answers.")}</p>
              </div>
            </section>
          )}

          {gateCopy(currentView, t) ? (
            <section className="status-card pending-card">
              <div className="status-icon amber"><ClockIcon /></div>
              <div className="status-copy">
                <span>{t("Next step")}</span>
                <strong>{gateCopy(currentView, t)!.title}</strong>
                <p>{gateCopy(currentView, t)!.detail}</p>
              </div>
            </section>
          ) : currentView.readiness.primerStage !== "none" ? (
            <section className="status-card pending-card pairing-primer">
              <div className="status-icon green"><HeartIcon /></div>
              <div className="status-copy">
                <span>{t("Almost there")}</span>
                <strong>
                  {currentView.readiness.primerStage === "awaiting_self"
                    ? t("One last step from you")
                    : t("One last step from them")}
                </strong>
                {currentView.readiness.primerStage === "awaiting_self" && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={pending === "confirm"}
                    onClick={confirmReveal}
                  >
                    <CheckIcon size={16} /> {t("Ready to meet")}
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="status-card pending-card">
              <div className="status-icon green"><HeartIcon /></div>
              <div className="status-copy">
                <span>{t("Readiness")}</span>
                <strong>{readinessCopy(currentView, t).title}</strong>
                <p>{readinessCopy(currentView, t).detail}</p>
                {!currentView.readiness.selfReady && (
                  <div className="pairing-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={pending !== null}
                      onClick={() => answerReadiness("ready")}
                    >
                      {pending === "ready" ? t("Saving…") : t("Yes, I'm ready")}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={pending !== null}
                      onClick={() => answerReadiness("not_yet")}
                    >
                      {pending === "not_yet" ? t("Saving…") : t("Not yet")}
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
                <span>{t("Identities revealed")}</span>
                <strong>{t("This pairing has moved forward.")}</strong>
                <p>{t("Their name and contact details are shown only when you choose to see them.")}</p>
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
            <span>{t("One last step")}</span>
            <strong>{t("You're both ready.")}</strong>
            <p>{t("When you each confirm, Kidan reveals your names and contact details to one another — at the same time, so no one is left waiting after revealing theirs.")}</p>
            <div className="pairing-actions">
              <button type="button" className="primary-button" disabled={pending === "confirm"} onClick={confirmReveal}>
                <CheckIcon size={16} /> {pending === "confirm" ? t("Confirming…") : t("I'm ready to meet them")}
              </button>
              <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void refresh().then((v) => v && applyView(v))}>
                {t("Not yet — keep chatting")}
              </button>
            </div>
          </div>
        </section>
      )}

      {phase.kind === "waiting_confirm" && (
        <section className="status-card pending-card pairing-primer">
          <div className="status-icon amber"><ClockIcon /></div>
          <div className="status-copy">
            <span>{t("Waiting")}</span>
            <strong>{t("Waiting for them to confirm.")}</strong>
            <p>{t("The moment they do, the reveal happens for you both at once. Nothing is shared until then.")}</p>
          </div>
        </section>
      )}

      {phase.kind === "revealed" && (
        <section className="status-card pending-card pairing-reveal">
          <div className="status-icon green"><ShieldCheckIcon /></div>
          <div className="status-copy">
            <span>{t("The reveal")}</span>
            <strong>{phase.counterpart.legalName}</strong>
            <p>{phase.counterpart.publicCode} · {phase.counterpart.phone}</p>
            <p className="quiet-note">{t("Reach out when you're both ready. Kindly, and at your own pace.")}</p>
            <div className="pairing-actions">
              <button type="button" className="primary-button" disabled={pending !== null} onClick={together}>
                <HeartIcon size={16} /> {pending === "together" ? t("Saving…") : t("We're together")}
              </button>
            </div>
          </div>
        </section>
      )}

      {phase.kind === "closed" && (
        <section className="status-card pending-card">
          <div className="status-icon muted"><ShieldCheckIcon /></div>
          <div className="status-copy">
            <span>{t("Closed with care")}</span>
            <strong>{t("This pairing has been respectfully closed.")}</strong>
            <p>
              {phase.followupDueAt
                ? t("Kidan will check in with you once more around {date}.", { date: new Date(phase.followupDueAt).toLocaleDateString(lang === "am" ? "am-ET" : "en-ET", { day: "numeric", month: "long" }) })
                : t("Kidan will check in with you once more in a few days.")}
              {" "}{t("Thank you for trying with sincerity.")}
            </p>
          </div>
        </section>
      )}

      {phase.kind === "together" && (
        <section className="status-card pending-card pairing-reveal">
          <div className="status-icon green"><HeartIcon /></div>
          <div className="status-copy">
            <span>{t("Kidane Mihret")}</span>
            <strong>{t("You're walking forward together.")}</strong>
            <p>{t("Kidan will quietly step back. May your path be blessed.")}</p>
          </div>
        </section>
      )}

      {error && <p className="form-error" role="alert">{t(error)}</p>}

      <div className="quiet-note">
        <LockIcon size={17} />
        <p>{t("Closing a pairing is always possible and always kind. Identities are revealed only through the shared reveal, and shown only when you deliberately ask.")}</p>
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
  const t = useT();

  let title = t("See your next step");
  let detail = t("The readiness loop and reveal happen here — gentle, and always at both your paces.");
  let iconClass = "amber";

  if (journey) {
    if (journey.stage === "revealed") {
      title = t("Identities revealed");
      detail = t("Names and contact details were revealed together. Open to view — deliberately, when you choose.");
      iconClass = "green";
    } else if (journey.stage === "decoupled" || journey.stage === "completed_together") {
      return null;
    } else if (journey.readiness.primerStage !== "none") {
      title = journey.readiness.primerStage === "awaiting_self" ? t("One last step from you") : t("One last step from them");
      detail = t("You're both ready — confirm to reveal your names to each other at the same time.");
      iconClass = "green";
    } else if (journey.readiness.otherReady && !journey.readiness.selfReady) {
      title = t("{code} is ready when you are", { code: journey.counterpartCode });
      detail = t("They're ready for the next step. Answer honestly — not yet is a good answer.");
      iconClass = "green";
    } else if (journey.readiness.selfReady && !journey.readiness.otherReady) {
      title = t("Waiting on their answer");
      detail = t("You've said ready. We'll let you know the moment they answer too.");
    } else if (!journey.gate.gateMet) {
      const parts: string[] = [];
      if (journey.gate.daysRemaining > 0) parts.push(t("{n}d", { n: journey.gate.daysRemaining }));
      if (journey.gate.messagesRemaining > 0) parts.push(t("{n} messages", { n: journey.gate.messagesRemaining }));
      title = t("Getting to know each other");
      detail = t("The next step unlocks after {parts} — keep chatting.", { parts: parts.join(` ${t("and")} `) });
    } else if (journey.readiness.zombieReflectionDue) {
      title = t("Where do you two stand?");
      detail = t("A quiet moment to reflect — ready, not yet, or a respectful close are all honest answers.");
    }
  }

  return (
    <button type="button" className="status-card pending-card pairing-next-step" onClick={onOpen}>
      <div className={`status-icon ${iconClass}`}>
        {iconClass === "green" ? <HeartIcon /> : <ClockIcon />}
      </div>
      <div className="status-copy">
        <span>{t("Next step")}</span>
        <strong>{t(title)}</strong>
        <p>{t(detail)}</p>
      </div>
    </button>
  );
}
