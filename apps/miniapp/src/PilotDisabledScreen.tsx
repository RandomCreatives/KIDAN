import { Brand } from "./components/Brand";
import { LockIcon, ShieldCheckIcon } from "./components/Icons";

export function PilotDisabledScreen({ onReopen, saved = false }: { onReopen: () => void; saved?: boolean }) {
  return (
    <main className="screen standard-screen pilot-screen">
      <header className="topbar">
        <Brand />
        <span className="header-label">Preview</span>
      </header>
      <section className="page-intro">
        <span className="section-kicker">Limited preview</span>
        <h1>{saved ? "Your draft is saved" : "Preview only"}</h1>
        <p>
          In this preview you can sign in and save your public profile sections. Private identity,
          verification, submission, administrator review, discovery, and connections are not enabled yet.
        </p>
      </section>
      <section className="trust-banner profile-trust">
        <ShieldCheckIcon />
        <div>
          <strong>{saved ? "Your public draft was transmitted and saved" : "Your public draft has not been saved yet"}</strong>
          <span>Verification, consent, and review remain disabled in this preview.</span>
        </div>
      </section>
      <div className="quiet-note">
        <LockIcon size={17} />
        <p>
          Only your public profile sections are transmitted in this preview. Telegram sign-in sends the launch
          credential required for authentication; no verification identity, phone number, or contact details are
          shared.
        </p>
      </div>
      <button className="secondary-button" type="button" onClick={onReopen}>
        Review your draft
      </button>
    </main>
  );
}
