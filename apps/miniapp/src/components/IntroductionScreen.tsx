import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionItem, IntroductionMessage } from "@kidan/contracts";
import { KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { ArrowLeftIcon, LockIcon, ShieldCheckIcon } from "./Icons";

interface IntroductionScreenProps {
  connection: ConnectionItem;
  onBack: () => void;
}

const CONTACT_HINT = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|@[a-z0-9_]{3,}|\+?\d[\d\s-]{7,}\d)/i;

/**
 * Restricted in-app introduction (Track D3). Opens only for a 'connected'
 * pair. The conversation stays inside the app: the server rejects phone
 * numbers, Telegram handles, and links, and the client gives an immediate
 * hint as well. No name, photo, phone, or Telegram identity is shown — the
 * other party is represented by their values-only discovery profile.
 */
export function IntroductionScreen({ connection, onBack }: IntroductionScreenProps) {
  const { csrfToken } = useAuth();
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();

  const [messages, setMessages] = useState<IntroductionMessage[] | null>(null);
  const [otherSummary, setOtherSummary] = useState<{ bio: string; values: string[] } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    void clientRef
      .current!.getIntroduction(connection.id)
      .then((thread) => {
        if (cancelled) return;
        setMessages(thread.messages);
        setOtherSummary({ bio: thread.other.bio, values: thread.other.values });
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [connection.id]);

  useEffect(() => load(), [load]);

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body || sending) return;
    if (CONTACT_HINT.test(body)) {
      setError("Introductions stay in-app for now. Phone numbers, Telegram handles, and links can't be shared here.");
      return;
    }
    setError(null);
    setSending(true);
    haptic("success");
    void clientRef
      .current!.postIntroduction(connection.id, body, csrfToken ?? "")
      .then(() => {
        setDraft("");
        load();
      })
      .catch(() => setError("Your message could not be sent. Keep it free of contact details and try again."))
      .finally(() => setSending(false));
  }, [draft, sending, connection.id, csrfToken, load]);

  return (
    <main className="screen standard-screen introduction-screen">
      <header className="topbar">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back to connections">
          <ArrowLeftIcon size={20} />
        </button>
        <Brand />
        <span className="header-label">Introduction</span>
      </header>

      <section className="page-intro">
        <span className="section-kicker"><ShieldCheckIcon size={14} /> Restricted introduction</span>
        <h1>A private hello</h1>
        <p>This conversation stays inside Kidan. Names, phone numbers, Telegram handles, and links are not shared — get to know each other through values first.</p>
      </section>

      <section className="introduction-profile status-card pending-card">
        <div className="status-icon green"><ShieldCheckIcon /></div>
        <div className="status-copy">
          <span>{connection.other.publicCode} · {connection.other.age} · {connection.other.city}</span>
          <strong>Values-only introduction</strong>
          {otherSummary?.bio && <p>{otherSummary.bio}</p>}
        </div>
      </section>

      <section className="introduction-thread" aria-live="polite">
        {messages === null ? (
          <p className="quiet-copy">Loading your introduction…</p>
        ) : messages.length === 0 ? (
          <p className="quiet-copy">No messages yet. Send a brief, values-centered greeting to begin.</p>
        ) : (
          messages.map((message) =>
            message.hidden ? (
              <div key={message.id} className="intro-bubble intro-hidden">
                <span>This message was removed by a moderator.</span>
              </div>
            ) : (
              <div key={message.id} className={`intro-bubble ${message.fromMe ? "mine" : "theirs"}`}>
                <p>{message.body}</p>
              </div>
            ),
          )
        )}
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="introduction-composer">
        <textarea
          value={draft}
          maxLength={600}
          rows={2}
          placeholder="Write a short greeting (no contact details)…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" className="primary-button" disabled={sending || draft.trim().length === 0} onClick={send}>
          Send
        </button>
      </section>

      <div className="quiet-note">
        <LockIcon size={17} />
        <p>Contact details are revealed only through a separate, future consent step — never in the pilot introduction.</p>
      </div>
    </main>
  );
}
