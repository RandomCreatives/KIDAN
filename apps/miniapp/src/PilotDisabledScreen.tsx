import { Brand } from "./components/Brand";
import { LockIcon, ShieldCheckIcon } from "./components/Icons";
import { useT } from "./i18n/LanguageProvider";

export function PilotDisabledScreen({ onReopen, saved = false }: { onReopen: () => void; saved?: boolean }) {
  const t = useT();
  return (
    <main className="screen standard-screen pilot-screen">
      <header className="topbar">
        <Brand />
        <span className="header-label">{t("Preview")}</span>
      </header>
      <section className="page-intro">
        <span className="section-kicker">{t("Limited preview")}</span>
        <h1>{saved ? t("Your draft is saved") : t("Preview only")}</h1>
        <p>{t("In this preview you can sign in and save your public profile sections. Private identity, verification, submission, administrator review, discovery, and connections are not enabled yet.")}</p>
      </section>
      <section className="trust-banner profile-trust">
        <ShieldCheckIcon />
        <div>
          <strong>{saved ? t("Your public draft was transmitted and saved") : t("Your public draft has not been saved yet")}</strong>
          <span>{t("Verification, consent, and review remain disabled in this preview.")}</span>
        </div>
      </section>
      <div className="quiet-note">
        <LockIcon size={17} />
        <p>{t("Telegram launch data is sent securely to Kidan to authenticate your session. The current API retains the validated Telegram ID and authentication date for account and session security. Telegram names and usernames are not added to your public draft or shown in discovery. This preview does not collect Kidan private identity, verification-photo, or submission-consent details.")}</p>
      </div>
      <button className="secondary-button" type="button" onClick={onReopen}>
        {t("Review your draft")}
      </button>
    </main>
  );
}
