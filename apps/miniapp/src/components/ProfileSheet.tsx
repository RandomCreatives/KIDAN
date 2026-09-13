import { useEffect } from "react";
import type { DemoProfile } from "../data/demoProfiles";
import { HeartIcon, LockIcon, ShieldCheckIcon, XIcon } from "./Icons";
import { useT } from "../i18n/LanguageProvider";

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
  const t = useT();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="profile-sheet-title">
      <button className="sheet-backdrop" type="button" onClick={onClose} aria-label={t("Close profile")} />
      <section className="profile-sheet">
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <span className="sheet-kicker">{t("Anonymous profile")}</span>
            <h2 id="profile-sheet-title">{profile.age} · {profile.gender === "male" ? t("Male") : t("Female")} · {profile.city}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("Close")}><XIcon /></button>
        </header>

        <div className="trust-banner"><ShieldCheckIcon /> <div><strong>{t("Identity privately verified")}</strong><span>{t("Name and contact remain hidden.")}</span></div></div>

        <div className="detail-section">
          <h3>{t("At a glance")}</h3>
          <div className="detail-grid">
            <div><span>{t("Education")}</span><strong>{profile.educationLevel ? t(profile.educationLevel) : "—"}</strong></div>
            <div><span>{t("Work")}</span><strong>{profile.occupationCategory ? t(profile.occupationCategory) : "—"}</strong></div>
            <div><span>{t("Height")}</span><strong>{profile.heightCm} {t("cm")}</strong></div>
            <div><span>{t("Profile")}</span><strong>{profile.publicCode}</strong></div>
          </div>
        </div>

        <div className="detail-section">
          <h3>{t("Faith & intention")}</h3>
          <p>{profile.faithNote ? t(profile.faithNote) : ""}</p>
          <p>{profile.familyNote ? t(profile.familyNote) : ""}</p>
        </div>

        <div className="detail-section">
          <h3>{t("Values that matter")}</h3>
          <div className="value-list large">
            {profile.values.map((value) => <span key={value}>{t(labels[value] ?? value)}</span>)}
          </div>
        </div>

        <div className="detail-section">
          <h3>{t("In their words")}</h3>
          <blockquote>“{profile.bio}”</blockquote>
        </div>

        <div className="privacy-note"><LockIcon size={18} /><p>{t("Interest stays private. No message or identity is shared unless interest is mutual, an admin approves, and both people confirm.")}</p></div>

        <button className="primary-button" type="button" onClick={onInterested}><HeartIcon size={19} /> {t("I’m interested")}</button>
      </section>
    </div>
  );
}
