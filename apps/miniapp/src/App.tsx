import { useState } from "react";
import { ConnectionsScreen } from "./components/ConnectionsScreen";
import { DiscoverScreen } from "./components/DiscoverScreen";
import { MyProfileScreen } from "./components/MyProfileScreen";
import { PairingScreen } from "./components/PairingScreen";
import { PrivacyScreen } from "./components/PrivacyScreen";
import { RealHomeGate } from "./components/RealHomeGate";
import { RequestsScreen } from "./components/RequestsScreen";
import { CompassIcon, ConnectionIcon, UserIcon } from "./components/Icons";
import { useAuth } from "./auth/useAuth";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { PilotDisabledScreen } from "./PilotDisabledScreen";
import { readPairingFocusFromUrl, readTargetTabFromUrl } from "./lib/deepLink";
import { useT } from "./i18n/LanguageProvider";

type Tab = "discover" | "connections" | "profile";
type Overlay = null | "requests";

/** Initial tab chosen at boot from the bot's deep-link query (if any). */
function initialTab(): Tab {
  const target = readTargetTabFromUrl(window.location.href);
  if (target === "connections" || target === "profile" || target === "pairing") return target === "pairing" ? "connections" : target;
  if (target === "status") return "profile";
  return "discover";
}

/** Initial pairing-journey focus (?tab=pairing&connection=…), with side effects read once. */
const initialPairingFocus: string | null =
  typeof window !== "undefined" ? readPairingFocusFromUrl(window.location.href) : null;

export function App() {
  const t = useT();
  const { isDemo, realSubmissionsEnabled } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [draftSaved, setDraftSaved] = useState(false);
  const [approved, setApproved] = useState(false);
  // Bumped to force the real home gate to re-evaluate after onboarding completes.
  const [gateKey, setGateKey] = useState(0);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Journey deep link from a bot pulse: render the next-step screen over the
  // connections tab until the candidate backs out.
  const [pairingFocus, setPairingFocus] = useState<string | null>(initialPairingFocus);
  const openRequests = () => setOverlay("requests");

  const closeOnboarding = (saved?: boolean) => {
    if (saved) setDraftSaved(true);
    setShowOnboarding(false);
    setGateKey((key) => key + 1);
  };

  if (showOnboarding) {
    return (
      <div className="app-shell">
        <div className="app-viewport onboarding-viewport">
          <OnboardingFlow
            mode={isDemo ? "demo" : "real"}
            onExit={(saved) => closeOnboarding(saved)}
            onComplete={(saved) => closeOnboarding(saved)}
          />
        </div>
      </div>
    );
  }

  // Real pilot users: discovery is gated on administrator review approval.
  // When real submissions are not enabled yet (preview deployment), keep the
  // prototype "pilot disabled" screen; when enabled, use the review gate.
  if (!isDemo) {
    return (
      <div className="app-shell">
        <div className="app-viewport">
          {!realSubmissionsEnabled ? (
            <PilotDisabledScreen onReopen={() => setShowOnboarding(true)} saved={draftSaved} />
          ) : approved ? (
            <>
              {showPrivacy ? (
                <PrivacyScreen onClose={() => setShowPrivacy(false)} />
              ) : pairingFocus ? (
                <PairingScreen connectionId={pairingFocus} onBack={() => setPairingFocus(null)} />
              ) : overlay === "requests" ? (
                <RequestsScreen onBack={() => setOverlay(null)} />
              ) : (
                <>
                  {tab === "discover" && <DiscoverScreen onOpenRequests={openRequests} />}
                  {tab === "connections" && <ConnectionsScreen onOpenRequests={openRequests} />}
                  {tab === "profile" && (
                    <MyProfileScreen
                      onPreviewOnboarding={() => setShowOnboarding(true)}
                      onPrivacy={() => setShowPrivacy(true)}
                    />
                  )}
                </>
              )}
              {!showPrivacy && !overlay && !pairingFocus && (
                <nav className="bottom-nav" aria-label={t("Primary navigation")}>
                  <button className={tab === "discover" ? "active" : ""} type="button" onClick={() => setTab("discover")}>
                    <CompassIcon /><span>{t("Discover")}</span>
                  </button>
                  <button className={tab === "connections" ? "active" : ""} type="button" onClick={() => setTab("connections")}>
                    <span className="nav-icon-wrap"><ConnectionIcon /> <i /></span><span>{t("Connections")}</span>
                  </button>
                  <button className={tab === "profile" ? "active" : ""} type="button" onClick={() => setTab("profile")}>
                    <UserIcon /><span>{t("Profile")}</span>
                  </button>
                </nav>
              )}
            </>
          ) : (
            <RealHomeGate
              key={gateKey}
              onApproved={() => setApproved(true)}
              onResumeOnboarding={() => setShowOnboarding(true)}
            />
          )}
        </div>
      </div>
    );
  }

  // Demo / prototype: interactive tabs with in-memory data.
  return (
    <div className="app-shell">
      <div className="app-viewport">
        {showPrivacy ? (
          <PrivacyScreen onClose={() => setShowPrivacy(false)} />
        ) : overlay === "requests" ? (
          <RequestsScreen onBack={() => setOverlay(null)} />
        ) : (
          <>
        {tab === "discover" && <DiscoverScreen onOpenRequests={openRequests} />}
        {tab === "connections" && <ConnectionsScreen onOpenRequests={openRequests} />}
        {tab === "profile" && (
          <MyProfileScreen
            onPreviewOnboarding={() => setShowOnboarding(true)}
            onPrivacy={() => setShowPrivacy(true)}
          />
        )}
          </>
        )}

        {!showPrivacy && !overlay && (
          <nav className="bottom-nav" aria-label={t("Primary navigation")}>
            <button className={tab === "discover" ? "active" : ""} type="button" onClick={() => setTab("discover")}>
              <CompassIcon /><span>{t("Discover")}</span>
            </button>
            <button className={tab === "connections" ? "active" : ""} type="button" onClick={() => setTab("connections")}>
              <span className="nav-icon-wrap"><ConnectionIcon /> <i /></span><span>{t("Connections")}</span>
            </button>
            <button className={tab === "profile" ? "active" : ""} type="button" onClick={() => setTab("profile")}>
              <UserIcon /><span>{t("Profile")}</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
