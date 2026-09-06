import { useCallback, useEffect, useRef, useState } from "react";
import { demoProfiles, type DemoProfile } from "../data/demoProfiles";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { DiscoveryCard } from "./DiscoveryCard";
import { ProfileSheet } from "./ProfileSheet";
import { ShieldCheckIcon, SlidersIcon, SparkIcon } from "./Icons";
import { KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { toDemoProfile } from "../data/cardAdapter.js";

// Both demo and real feed cards render as DemoProfile (real values-only cards
// get abstract presentation via the adapter; no identity is added).
type Card = DemoProfile;

export function DiscoverScreen() {
  const { realSubmissionsEnabled, csrfToken } = useAuth();
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [realCards, setRealCards] = useState<DemoProfile[] | null>(null);

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
      setToast(decision === "interested" ? "Interest saved privately" : "Passed privately");
      if (decision === "interested") haptic("success");

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
        <button className="filter-button" type="button" aria-label="Discovery preferences"><SlidersIcon size={20} /></button>
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
      {toast && <div className="toast" role="status"><ShieldCheckIcon size={17} /> {toast}</div>}
    </main>
  );
}
