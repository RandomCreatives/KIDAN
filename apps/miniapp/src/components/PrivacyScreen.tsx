import { useRef, useState } from "react";
import { ApiError, KidanApiClient } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { LockIcon, ShieldCheckIcon } from "./Icons.js";
import { useT } from "../i18n/LanguageProvider";

/**
 * Privacy & data rights screen (B6). Static, in-app privacy policy plus the
 * self-serve export and delete actions. Actions only run when real submissions
 * are enabled (demo mode makes no network calls).
 */
export function PrivacyScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { realSubmissionsEnabled, csrfToken } = useAuth();
  const effectiveCsrf = csrfToken ?? "";
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (busy) return;
    setBusy("export");
    setError(null);
    setMessage(null);
    try {
      const bundle = await clientRef.current!.exportData();
      // Deliver the bundle as a downloaded JSON file.
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `kidan-data-${bundle.publicCode}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(t("Your data bundle has been downloaded."));
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === "NETWORK"
        ? t("Could not reach the service. Please try again.")
        : t("Something went wrong. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (busy) return;
    const confirmed = window.confirm(
      t("Delete your Kidan account and all your data? This permanently removes your profile, identity details, verification photo, and review history. This cannot be undone."),
    );
    if (!confirmed) return;
    const confirmedAgain = window.confirm(t("Are you absolutely sure? Your account cannot be restored."));
    if (!confirmedAgain) return;
    setBusy("delete");
    setError(null);
    setMessage(null);
    try {
      await clientRef.current!.deleteAccount(effectiveCsrf);
      setMessage(t("Your account and data have been deleted. You can close Kidan."));
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === "NETWORK"
        ? t("Could not reach the service. Please try again.")
        : t("Deletion failed. Please try again."));
      setBusy(null);
    }
  }

  return (
    <main className="screen standard-screen privacy-screen">
      <header className="topbar">
        <button type="button" className="privacy-back" onClick={onClose} aria-label={t("Back")}>
          ‹
        </button>
        <span className="header-label">{t("Privacy & your data")}</span>
        <span className="privacy-back-spacer" />
      </header>

      <section className="trust-banner profile-trust">
        <ShieldCheckIcon />
        <div>
          <strong>{t("Anonymity by design")}</strong>
          <span>{t("Your name, phone number, and verification photo are never shown in discovery.")}</span>
        </div>
      </section>

      <section className="privacy-policy">
        <h2>{t("How Kidan handles your data")}</h2>
        <ul className="privacy-list">
          <li><LockIcon size={17} /><span><strong>{t("Private by default.")}</strong> {t("Discovery is values-only. Your name, phone, and date of birth are encrypted and visible only to an administrator verifying your identity.")}</span></li>
          <li><LockIcon size={17} /><span><strong>{t("Verification photo.")}</strong> {t("Your photo is used only for administrator verification, is never used in discovery, and is permanently deleted 30 days after your profile is approved.")}</span></li>
          <li><LockIcon size={17} /><span><strong>{t("Restricted introductions.")}</strong> {t("Contact details are only shared after mutual interest, administrator approval, and both people's confirmation.")}</span></li>
          <li><LockIcon size={17} /><span><strong>{t("No ads or sale.")}</strong> {t("We do not sell personal data, show ads, or use your information for AI training.")}</span></li>
          <li><LockIcon size={17} /><span><strong>{t("Your rights.")}</strong> {t("You can download everything we hold about you, or permanently delete your account and all of your data, at any time below.")}</span></li>
        </ul>
      </section>

      {realSubmissionsEnabled ? (
        <section className="privacy-actions">
          <button type="button" className="settings-row privacy-action" onClick={() => void handleExport()} disabled={busy !== null}>
            <span className="settings-icon"><ShieldCheckIcon size={19} /></span>
            <span><strong>{busy === "export" ? t("Preparing…") : t("Download my data")}</strong><small>{t("A JSON copy of your profile, identity, photo, and consents.")}</small></span>
          </button>
          <button type="button" className="settings-row privacy-action danger" onClick={() => void handleDelete()} disabled={busy !== null}>
            <span className="settings-icon"><LockIcon size={19} /></span>
            <span><strong>{busy === "delete" ? t("Deleting…") : t("Delete my account")}</strong><small>{t("Permanently erase your account and all personal data.")}</small></span>
          </button>
          {message ? <p className="privacy-message ok" role="status">{message}</p> : null}
          {error ? <p className="privacy-message err" role="alert">{error}</p> : null}
        </section>
      ) : (
        <section className="privacy-actions">
          <p className="privacy-note">{t("Data export and deletion become available when submissions are enabled. During this prototype, no personal data leaves your device.")}</p>
        </section>
      )}
    </main>
  );
}
