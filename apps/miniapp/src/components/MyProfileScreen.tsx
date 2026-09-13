import { useState } from "react";
import { Brand } from "./Brand";
import { ChevronRightIcon, LockIcon, MailIcon, PauseIcon, ShieldCheckIcon, UserIcon } from "./Icons";
import { ReviewStatusCard } from "./ReviewStatusCard.js";
import { FeedbackScreen } from "./FeedbackScreen.js";
import { useAuth } from "../auth/useAuth.js";
import { useT } from "../i18n/LanguageProvider";
import { LanguageToggle } from "../i18n/LanguageToggle";

const settings = [
  { label: "Discovery profile", detail: "Age, city, faith & values", icon: <UserIcon size={19} /> },
  { label: "Partner preferences", detail: "Age, location & intentions", icon: <ShieldCheckIcon size={19} /> },
  { label: "Privacy & consent", detail: "Control how your data is used", icon: <LockIcon size={19} /> },
  { label: "Pause discovery", detail: "Hide without deleting", icon: <PauseIcon size={19} /> },
  { label: "Feedback & help", detail: "Send a comment or report", icon: <MailIcon size={19} /> },
];

export function MyProfileScreen({
  onPreviewOnboarding,
  onPrivacy,
}: {
  onPreviewOnboarding: () => void;
  onPrivacy: () => void;
}) {
  const t = useT();
  const { realSubmissionsEnabled } = useAuth();
  const [showFeedback, setShowFeedback] = useState(false);

  if (showFeedback) {
    return <FeedbackScreen onBack={() => setShowFeedback(false)} />;
  }

  return (
    <main className="screen standard-screen">
      <header className="topbar"><Brand /><span className="header-label">{t("Your profile")}</span></header>

      <section className="identity-card">
        <div className="identity-orb"><span>87%</span></div>
        <div><span className="section-kicker">{t("Anonymous in discovery")}</span><h1>KD-6V8T3R</h1><p>{t("Your private reference code")}</p></div>
        <span className="active-pill">{t("Active")}</span>
      </section>

      <ReviewStatusCard enabled={realSubmissionsEnabled} />

      <section className="trust-banner profile-trust"><ShieldCheckIcon /><div><strong>{t("Identity verified privately")}</strong><span>{t("Your legal identity is never part of your discovery card.")}</span></div></section>

      <section className="settings-list" aria-label={t("Profile settings")}>
        {settings.map((item) => (
          <button
            key={item.label}
            className="settings-row"
            type="button"
            onClick={
              item.label === "Privacy & consent" ? onPrivacy
                : item.label === "Feedback & help" ? () => setShowFeedback(true)
                : onPreviewOnboarding
            }
          >
            <span className="settings-icon">{item.icon}</span>
            <span><strong>{t(item.label)}</strong><small>{t(item.detail)}</small></span>
            <ChevronRightIcon size={19} />
          </button>
        ))}
      </section>

      <section className="lang-row">
        <span className="lang-row-copy"><strong>{t("Language")}</strong><small>{t("English or Amharic — saved on this device.")}</small></span>
        <LanguageToggle />
      </section>

      <section className="data-promise">
        <LockIcon size={20} />
        <div><strong>{t("Your data promise")}</strong><p>{t("No ads, no social links, no profile selling, and no AI training on your personal information.")}</p></div>
      </section>
    </main>
  );
}
