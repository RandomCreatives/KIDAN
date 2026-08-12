import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DemoProfile } from "../data/demoProfiles";
import { haptic } from "../lib/telegram";
import { HeartIcon, InfoIcon, ShieldCheckIcon, XIcon } from "./Icons";

interface DiscoveryCardProps {
  profile: DemoProfile;
  depth: number;
  interactive: boolean;
  onDecision: (decision: "pass" | "interested") => void;
  onOpen: () => void;
}

const valueLabels: Record<string, string> = {
  active_faith: "Active faith",
  communication: "Communication",
  compassion: "Compassion",
  family_oriented: "Family-oriented",
  honesty: "Honesty",
  mutual_growth: "Mutual growth",
  patience: "Patience",
  service: "Service",
  tradition: "Tradition",
};

export function DiscoveryCard({ profile, depth, interactive, onDecision, onOpen }: DiscoveryCardProps) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const decide = (decision: "pass" | "interested") => {
    if (!interactive) return;
    haptic("decision");
    onDecision(decision);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interactive || event.pointerType === "mouse" && event.button !== 0) return;
    startX.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragging || !interactive) return;
    setDragX(event.clientX - startX.current);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragging || !interactive) return;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (Math.abs(dragX) > 86) {
      decide(dragX > 0 ? "interested" : "pass");
    }
    setDragX(0);
  };

  const transform = interactive
    ? `translate3d(${dragX}px, 0, 0) rotate(${dragX / 24}deg)`
    : `translate3d(0, ${depth * 8}px, 0) scale(${1 - depth * 0.035})`;

  return (
    <article
      className={`discovery-card ${dragging ? "is-dragging" : ""}`}
      style={{ transform, zIndex: 10 - depth, opacity: 1 - depth * 0.18 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label={`Anonymous profile, age ${profile.age}, ${profile.city}`}
    >
      {interactive && dragX !== 0 && (
        <div className={`swipe-stamp ${dragX > 0 ? "approve" : "pass"}`}>
          {dragX > 0 ? "INTERESTED" : "PASS"}
        </div>
      )}

      <div
        className="profile-visual"
        style={{ "--visual-accent": profile.visual.accent, "--visual-surface": profile.visual.surface } as React.CSSProperties}
      >
        <div className="visual-orbit orbit-one" />
        <div className="visual-orbit orbit-two" />
        <div className="visual-grain" />
        <div className="privacy-medallion">
          <span>{profile.visual.monogram}</span>
          <small>values first</small>
        </div>
        <div className="verified-chip"><ShieldCheckIcon size={15} /> Admin verified</div>
        <div className="visual-caption">
          <div className="profile-title-row">
            <h2>{profile.age}</h2>
            <span className="dot">•</span>
            <span>{profile.city}</span>
          </div>
          <p>{profile.publicCode}</p>
        </div>
      </div>

      <div className="card-content">
        <div className="card-eyebrow">{profile.occupationCategory} · {profile.educationLevel}</div>
        <p className="faith-note">{profile.faithNote}</p>
        <div className="value-list">
          {profile.values.slice(0, 3).map((value) => <span key={value}>{valueLabels[value] ?? value}</span>)}
        </div>
        <p className="profile-bio">{profile.bio}</p>
        <button className="text-button" type="button" onClick={onOpen}>
          View full profile <InfoIcon size={16} />
        </button>
      </div>

      <div className="card-actions" aria-label="Profile decisions">
        <button className="action-button pass" type="button" onClick={() => decide("pass")} aria-label="Pass privately">
          <XIcon size={25} />
        </button>
        <span className="action-hint">Swipe or choose</span>
        <button className="action-button interest" type="button" onClick={() => decide("interested")} aria-label="Express interest privately">
          <HeartIcon size={24} />
        </button>
      </div>
    </article>
  );
}
