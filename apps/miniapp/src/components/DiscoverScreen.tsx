import { useCallback, useEffect, useRef, useState } from "react";
import { demoProfiles, type DemoProfile } from "../data/demoProfiles";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { DiscoveryCard } from "./DiscoveryCard";
import { ProfileSheet } from "./ProfileSheet";
import { MailIcon, ShieldCheckIcon, SlidersIcon, SparkIcon } from "./Icons";
import { KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { toDemoProfile } from "../data/cardAdapter.js";

// Both demo and real feed cards render as DemoProfile (real values-only cards
// get abstract presentation via the adapter; no identity is added).
type Card = DemoProfile;

export function DiscoverScreen({ onOpenRequests }: { onOpenRequests?: () => void } = {}) {
  const { realSubmissionsEnabled, csrfToken } = useAuth();
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [realCards, setRealCards] = useState<DemoProfile[] | null>(null);
  const [requestsLeft, setRequestsLeft] = useState<number | null>(null);
  // Card the caller just right-swiped and may now send a formal request to.
  const [requestTarget, setRequestTarget] = useState<Card | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);

  // Track the rolling daily request allowance for the counter / send action.
  useEffect(() => {
    if (!realSubmissionsEnabled) {
      setRequestsLeft(null);
      return;
    }
    let cancelled = false;
    void clientRef
      .current!.getOutgoingRequests()
      .then((res) => { if (!cancelled) setRequestsLeft(res.remainingToday); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [realSubmissionsEnabled]);

  // When real submissions are enabled, load the values-only feed. Demo mode
  // keeps using the in-memory demo deck and makes no network calls.
  useEffect(() => {
    if (!realSubmissionsEnabled) {
      setRealCards(null);
      return;
    }
    let cancelled = false;
    void clientRef
      .current!.getDiscoveryFeed()
      .then((feed) => {
        if (!cancelled) setRealCards(feed.cards.map(toDemoProfile));
      })
      .catch(() => {
        if (!cancelled) setRealCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [realSubmissionsEnabled]);

  const cards: Card[] = realSubmissionsEnabled ? (realCards ?? []) : (demoProfiles as Card[]);
  const loading = realSubmissionsEnabled && realCards === null;
  const current = cards[index];

  const decide = useCallback(
    (decision: "pass" | "interested", card?: Card) => {
      const target = card ?? current;
      setSelected(null);
      if (decision === "interested") {
        haptic("success");
        // A right swipe is a private shortlist entry. In the real pilot we
        // surface the committed next step: send a formal introduction request.
        if (realSubmissionsEnabled && target) setRequestTarget(target);
        else setToast("Added to your private shortlist");
      } else {
        setToast("Passed privately");
      }

      if (realSubmissionsEnabled && target) {
        void clientRef
          .current!.recordDiscoveryDecision(
            {
              targetPublicCode: target.publicCode,
              decision,
              idempotencyKey: crypto.randomUUID(),
            },
            csrfToken ?? "",
          )
          .catch(() => undefined);
      }

      window.setTimeout(() => setIndex((value) => value + 1), 180);
      window.setTimeout(() => setToast(null), 2200);
    },
    [current, realSubmissionsEnabled, csrfToken],
  );

  // The committed act: send a formal introduction request to a shortlisted
  // card. Rate-limited to a rolling daily cap (handled server-side).
  const sendRequest = useCallback(
    (card: Card) => {
      setRequestBusy(true);
      void clientRef
        .current!.sendIntroductionRequest(
          { targetPublicCode: card.publicCode, idempotencyKey: crypto.randomUUID() },
          csrfToken ?? "",
        )
        .then((res) => {
          setRequestsLeft(res.remainingToday);
          setRequestTarget(null);
          setToast("Introduction request sent — you’ll see it if they accept.");
          window.setTimeout(() => setToast(null), 2600);
        })
        .catch((error: { code?: string }) => {
          setRequestTarget(null);
          if (error?.code === "INTENTION_RATE_LIMIT") {
            setToast("Daily limit reached — you can send more requests tomorrow.");
          } else if (error?.code === "REQUEST_ALREADY_EXISTS") {
            setToast("You’ve already sent a request to this person.");
          } else {
            setToast("Couldn’t send the request just now.");
          }
          window.setTimeout(() => setToast(null), 2800);
        })
        .finally(() => setRequestBusy(false));
    },
    [csrfToken],
  );

  const resetDeck = () => {
    setIndex(0);
    if (realSubmissionsEnabled) {
      void clientRef
        .current!.getDiscoveryFeed()
        .then((feed) => setRealCards(feed.cards.map(toDemoProfile)))
        .catch(() => setRealCards([]));
    }
  };

  return (
    <main className="screen discover-screen">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          {realSubmissionsEnabled && (
            <button className="filter-button" type="button" aria-label="Your introductions and shortlist" onClick={onOpenRequests}>
              <MailIcon size={20} />
            </button>
          )}
          <button className="filter-button" type="button" aria-label="Discovery preferences"><SlidersIcon size={20} /></button>
        </div>
      </header>

      <div className="privacy-strip"><ShieldCheckIcon size={16} /><span>Anonymous discovery</span><i /> <span>Admin verified</span></div>

      <section className="deck-wrap" aria-label="Profile discovery">
        {loading ? (
          <div className="deck-empty">
            <div className="empty-icon"><SparkIcon size={30} /></div>
            <span>Loading today’s introductions…</span>
          </div>
        ) : current ? (
          <div className="card-stack">
            {cards.slice(index, index + 3).map((profile, offset) => (
              <DiscoveryCard
                key={profile.id}
                profile={profile}
                depth={offset}
                interactive={offset === 0}
                onDecision={(d) => decide(d, profile)}
                onOpen={() => setSelected(profile)}
              />
            )).reverse()}
          </div>
        ) : (
          <div className="deck-empty">
            <div className="empty-icon"><SparkIcon size={30} /></div>
            <span>Today’s introductions are complete</span>
            <h2>Thoughtful, not endless.</h2>
            <p>A small daily set keeps discovery intentional. New approved profiles will appear here.</p>
            <button className="secondary-button" type="button" onClick={resetDeck}>Refresh</button>
          </div>
        )}
      </section>

      <p className="deck-footnote">One-sided interest is never disclosed.</p>

      {selected && (
        <ProfileSheet
          profile={selected}
          onClose={() => setSelected(null)}
          onInterested={() => decide("interested", selected)}
        />
      )}

      {requestTarget && (
        <div className="sheet-backdrop" role="presentation" onClick={() => !requestBusy && setRequestTarget(null)}>
          <div className="request-sheet" role="dialog" aria-modal="true" aria-label="Send an introduction request" onClick={(e) => e.stopPropagation()}>
            <span className="section-kicker">Your shortlist</span>
            <h2>Send a formal introduction?</h2>
            <p>
              A right swipe is private and never tells anyone. Sending a request is the
              committed step — {requestTarget.age}, {requestTarget.city} ({requestTarget.publicCode})
              {" "}will see your values-only summary and can accept or quietly decline.
            </p>
            <p className="quiet-copy">You can send {requestsLeft ?? 5} more today. Requests expire after 72 hours.</p>
            <div className="connection-actions">
              <button
                type="button"
                className="primary-button connection-button"
                disabled={requestBusy || (requestsLeft !== null && requestsLeft <= 0)}
                onClick={() => sendRequest(requestTarget)}
              >
                <MailIcon size={16} /> Send request
              </button>
              <button
                type="button"
                className="secondary-button connection-button"
                disabled={requestBusy}
                onClick={() => setRequestTarget(null)}
              >
                Keep on shortlist
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status"><ShieldCheckIcon size={17} /> {toast}</div>}
    </main>
  );
}
