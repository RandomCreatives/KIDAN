import { useEffect } from "react";
import type { DemoProfile } from "../data/demoProfiles";
import { HeartIcon, LockIcon, ShieldCheckIcon, XIcon } from "./Icons";

interface ProfileSheetProps {
  profile: DemoProfile;
  onClose: () => void;
  onInterested: () => void;
}

const labels: Record<string, string> = {
  active_faith: "Active faith",
  communication: "Open communication",
  compassion: "Compassion",
  family_oriented: "Family-oriented",
  honesty: "Honesty",
  mutual_growth: "Mutual growth",
  patience: "Patience",
  service: "Service",
  tradition: "Tradition",
};

export function ProfileSheet({ profile, onClose, onInterested }: ProfileSheetProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="profile-sheet-title">
      <button className="sheet-backdrop" type="button" onClick={onClose} aria-label="Close profile" />
      <section className="profile-sheet">
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <span className="sheet-kicker">Anonymous profile</span>
            <h2 id="profile-sheet-title">{profile.age} · {profile.city}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><XIcon /></button>
        </header>

        <div className="trust-banner"><ShieldCheckIcon /> <div><strong>Identity privately verified</strong><span>Name and contact remain hidden.</span></div></div>

        <div className="detail-section">
          <h3>At a glance</h3>
          <div className="detail-grid">
            <div><span>Education</span><strong>{profile.educationLevel}</strong></div>
            <div><span>Work</span><strong>{profile.occupationCategory}</strong></div>
            <div><span>Height</span><strong>{profile.heightCm} cm</strong></div>
            <div><span>Profile</span><strong>{profile.publicCode}</strong></div>
          </div>
        </div>

        <div className="detail-section">
          <h3>Faith & intention</h3>
          <p>{profile.faithNote}</p>
          <p>{profile.familyNote}</p>
        </div>

        <div className="detail-section">
          <h3>Values that matter</h3>
          <div className="value-list large">
            {profile.values.map((value) => <span key={value}>{labels[value] ?? value}</span>)}
          </div>
        </div>

        <div className="detail-section">
          <h3>In their words</h3>
          <blockquote>“{profile.bio}”</blockquote>
        </div>

        <div className="privacy-note"><LockIcon size={18} /><p>Interest stays private. No message or identity is shared unless interest is mutual, an admin approves, and both people confirm.</p></div>

        <button className="primary-button" type="button" onClick={onInterested}><HeartIcon size={19} /> I’m interested</button>
      </section>
    </div>
  );
}
