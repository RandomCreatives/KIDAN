import { useRef, useState } from "react";
import { KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { Brand } from "./Brand.js";
import { ArrowLeftIcon } from "./Icons.js";
import { haptic } from "../lib/telegram.js";
import { useT } from "../i18n/LanguageProvider";

type FeedbackKind = "feedback" | "comment" | "report";

const KIND_OPTIONS: { value: FeedbackKind; label: string }[] = [
  { value: "feedback", label: "Feedback" },
  { value: "comment", label: "Question" },
  { value: "report", label: "Report a concern" },
];

/**
 * Candidate-facing form to send feedback / comments / concerns privately to the
 * operator. No identity or contact detail is required or echoed — the message
 * body is the candidate's own words and goes straight to the operator console.
 */
export function FeedbackScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { csrfToken, isDemo } = useAuth();
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();

  const [kind, setKind] = useState<FeedbackKind>("feedback");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (trimmed.length < 1) {
      setError(t("Please write a short message."));
      return;
    }
    setBusy(true);
    try {
      if (isDemo) {
        // Browser-demo preview: honour the "no data is sent or saved" promise —
        // simulate the send locally instead of hitting the API without a
        // Telegram session (which would 401 and dead-end the visitor).
        await new Promise((resolve) => setTimeout(resolve, 350));
      } else {
        await clientRef.current!.submitFeedback({ kind, body: trimmed }, csrfToken ?? "");
      }
      haptic("success");
      setSent(true);
    } catch (caught) {
      haptic("warning");
      setError(caught instanceof Error ? caught.message : t("Could not send. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen standard-screen">
      <header className="topbar">
        <button type="button" className="icon-button" onClick={onBack} aria-label={t("Back")}>
          <ArrowLeftIcon />
        </button>
        <Brand />
        <span className="header-label">{t("Feedback & help")}</span>
      </header>

      {sent ? (
        <section className="feedback-sent" aria-live="polite">
          <span className="sent-mark">✓</span>
          <h1>{t("Thanks — got it")}</h1>
          <p>{t("Your message was sent privately to the Kidan operator.")}</p>
          <button type="button" className="primary-button" onClick={onBack}>
            {t("Back")}
          </button>
        </section>
      ) : (
        <form onSubmit={submit} className="feedback-form">
          <section className="panel">
            <h2>{t("What\\u2019s this about?")}</h2>
            <div className="kind-picker" role="radiogroup" aria-label={t("Message type")}>
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === option.value}
                  className={`kind-chip ${kind === option.value ? "is-active" : ""}`}
                  onClick={() => setKind(option.value)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>{t("Your message")}</h2>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t("Tell us what\\u2019s on your mind. This goes privately to the operator.")}
              maxLength={4000}
              rows={6}
              aria-label={t("Message")}
            />
            <p className="char-count">{body.length}/4000</p>
          </section>

          {error ? <p className="form-error" role="alert">{t(error)}</p> : null}

          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? t("Sending…") : t("Send to operator")}
          </button>
        </form>
      )}
    </main>
  );
}
