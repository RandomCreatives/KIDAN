import { useRef, useState } from "react";
import { KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { Brand } from "./Brand.js";
import { ArrowLeftIcon } from "./Icons.js";
import { haptic } from "../lib/telegram.js";

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
  const { csrfToken } = useAuth();
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
      setError("Please write a short message.");
      return;
    }
    setBusy(true);
    try {
      await clientRef.current!.submitFeedback({ kind, body: trimmed }, csrfToken ?? "");
      haptic("success");
      setSent(true);
    } catch (caught) {
      haptic("warning");
      setError(caught instanceof Error ? caught.message : "Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen standard-screen">
      <header className="topbar">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon />
        </button>
        <Brand />
        <span className="header-label">Feedback &amp; help</span>
      </header>

      {sent ? (
        <section className="feedback-sent" aria-live="polite">
          <span className="sent-mark">✓</span>
          <h1>Thanks — got it</h1>
          <p>Your message was sent privately to the Kidan operator.</p>
          <button type="button" className="primary-button" onClick={onBack}>
            Back
          </button>
        </section>
      ) : (
        <form onSubmit={submit} className="feedback-form">
          <section className="panel">
            <h2>What\u2019s this about?</h2>
            <div className="kind-picker" role="radiogroup" aria-label="Message type">
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === option.value}
                  className={`kind-chip ${kind === option.value ? "is-active" : ""}`}
                  onClick={() => setKind(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Your message</h2>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Tell us what\u2019s on your mind. This goes privately to the operator."
              maxLength={4000}
              rows={6}
              aria-label="Message"
            />
            <p className="char-count">{body.length}/4000</p>
          </section>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Sending…" : "Send to operator"}
          </button>
        </form>
      )}
    </main>
  );
}
