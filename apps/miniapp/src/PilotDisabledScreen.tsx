import { Brand } from "./components/Brand";
import { LockIcon, ShieldCheckIcon } from "./components/Icons";

export function PilotDisabledScreen({ onReopen }: { onReopen: () => void }) {
  return (
    <main className="screen standard-screen pilot-screen">
      <header className="topbar">
        <Brand />
        <span className="header-label">Preview</span>
      </header>
      <section className="page-intro">
        <span className="section-kicker">Limited preview</span>
        <h1>Your draft is saved</h1>
        <p>
          In this preview you can sign in and save your public profile sections. Private identity,
          verification, submission, administrator review, discovery, and connections are not enabled yet.
        </p>
      </section>
      <section className="trust-banner profile-trust">
        <ShieldCheckIcon />
        <div>
          <strong>Nothing beyond your public draft was transmitted</strong>
          <span>Verification, consent, and review remain disabled in this preview.</span>
        </div>
      </section>
      <div className="quiet-note">
        <LockIcon size={17} />
        <p>No names, phone numbers, Telegram accounts, or photos were shared.</p>
      </div>
      <button className="secondary-button" type="button" onClick={onReopen}>
        Review your draft
      </button>
    </main>
  );
}
