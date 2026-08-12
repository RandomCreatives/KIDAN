import { useCallback, useState } from "react";
import { demoProfiles, type DemoProfile } from "../data/demoProfiles";
import { haptic } from "../lib/telegram";
import { Brand } from "./Brand";
import { DiscoveryCard } from "./DiscoveryCard";
import { ProfileSheet } from "./ProfileSheet";
import { ShieldCheckIcon, SlidersIcon, SparkIcon } from "./Icons";

export function DiscoverScreen() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<DemoProfile | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const current = demoProfiles[index];

  const decide = useCallback((decision: "pass" | "interested") => {
    setSelected(null);
    setToast(decision === "interested" ? "Interest saved privately" : "Passed privately");
    if (decision === "interested") haptic("success");
    window.setTimeout(() => setIndex((value) => value + 1), 180);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const resetDeck = () => setIndex(0);

  return (
    <main className="screen discover-screen">
      <header className="topbar">
        <Brand />
        <button className="filter-button" type="button" aria-label="Discovery preferences"><SlidersIcon size={20} /></button>
      </header>

      <div className="privacy-strip"><ShieldCheckIcon size={16} /><span>Anonymous discovery</span><i /> <span>Admin verified</span></div>

      <section className="deck-wrap" aria-label="Profile discovery">
        {current ? (
          <div className="card-stack">
            {demoProfiles.slice(index, index + 3).map((profile, offset) => (
              <DiscoveryCard
                key={profile.id}
                profile={profile}
                depth={offset}
                interactive={offset === 0}
                onDecision={decide}
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
            <button className="secondary-button" type="button" onClick={resetDeck}>Preview again</button>
          </div>
        )}
      </section>

      <p className="deck-footnote">One-sided interest is never disclosed.</p>

      {selected && <ProfileSheet profile={selected} onClose={() => setSelected(null)} onInterested={() => decide("interested")} />}
      {toast && <div className="toast" role="status"><ShieldCheckIcon size={17} /> {toast}</div>}
    </main>
  );
}
