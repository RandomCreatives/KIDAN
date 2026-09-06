import { Brand } from "./Brand";
import { ChevronRightIcon, LockIcon, PauseIcon, ShieldCheckIcon, UserIcon } from "./Icons";
import { ReviewStatusCard } from "./ReviewStatusCard.js";
import { useAuth } from "../auth/useAuth.js";

const settings = [
  { label: "Discovery profile", detail: "Age, city, faith & values", icon: <UserIcon size={19} /> },
  { label: "Partner preferences", detail: "Age, location & intentions", icon: <ShieldCheckIcon size={19} /> },
  { label: "Privacy & consent", detail: "Control how your data is used", icon: <LockIcon size={19} /> },
  { label: "Pause discovery", detail: "Hide without deleting", icon: <PauseIcon size={19} /> },
];

export function MyProfileScreen({
  onPreviewOnboarding,
  onPrivacy,
}: {
  onPreviewOnboarding: () => void;
  onPrivacy: () => void;
}) {
  const { realSubmissionsEnabled } = useAuth();
  return (
    <main className="screen standard-screen">
      <header className="topbar"><Brand /><span className="header-label">Your profile</span></header>

      <section className="identity-card">
        <div className="identity-orb"><span>87%</span></div>
        <div><span className="section-kicker">Anonymous in discovery</span><h1>KD-6V8T3R</h1><p>Your private reference code</p></div>
        <span className="active-pill">Active</span>
      </section>

      <ReviewStatusCard enabled={realSubmissionsEnabled} />

      <section className="trust-banner profile-trust"><ShieldCheckIcon /><div><strong>Identity verified privately</strong><span>Your legal identity is never part of your discovery card.</span></div></section>

      <section className="settings-list" aria-label="Profile settings">
        {settings.map((item) => (
          <button
            key={item.label}
            className="settings-row"
            type="button"
            onClick={item.label === "Privacy & consent" ? onPrivacy : onPreviewOnboarding}
          >
            <span className="settings-icon">{item.icon}</span>
            <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            <ChevronRightIcon size={19} />
          </button>
        ))}
      </section>

      <section className="data-promise">
        <LockIcon size={20} />
        <div><strong>Your data promise</strong><p>No ads, no social links, no profile selling, and no AI training on your personal information.</p></div>
      </section>
    </main>
  );
}
