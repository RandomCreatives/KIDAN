import { useState } from "react";
import { ConnectionsScreen } from "./components/ConnectionsScreen";
import { DiscoverScreen } from "./components/DiscoverScreen";
import { MyProfileScreen } from "./components/MyProfileScreen";
import { PrivacyScreen } from "./components/PrivacyScreen";
import { RealHomeGate } from "./components/RealHomeGate";
import { CompassIcon, ConnectionIcon, UserIcon } from "./components/Icons";
import { useAuth } from "./auth/useAuth";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { PilotDisabledScreen } from "./PilotDisabledScreen";

type Tab = "discover" | "connections" | "profile";

export function App() {
  const { isDemo, realSubmissionsEnabled } = useAuth();
  const [tab, setTab] = useState<Tab>("discover");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [draftSaved, setDraftSaved] = useState(false);
  const [approved, setApproved] = useState(false);
  // Bumped to force the real home gate to re-evaluate after onboarding completes.
  const [gateKey, setGateKey] = useState(0);
  const [showPrivacy, setShowPrivacy] = useState(false);

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
              ) : (
                <>
                  {tab === "discover" && <DiscoverScreen />}
                  {tab === "connections" && <ConnectionsScreen />}
                  {tab === "profile" && (
                    <MyProfileScreen
                      onPreviewOnboarding={() => setShowOnboarding(true)}
                      onPrivacy={() => setShowPrivacy(true)}
                    />
                  )}
                </>
              )}
              {!showPrivacy && (
                <nav className="bottom-nav" aria-label="Primary navigation">
                  <button className={tab === "discover" ? "active" : ""} type="button" onClick={() => setTab("discover")}>
                    <CompassIcon /><span>Discover</span>
                  </button>
                  <button className={tab === "connections" ? "active" : ""} type="button" onClick={() => setTab("connections")}>
                    <span className="nav-icon-wrap"><ConnectionIcon /> <i /></span><span>Connections</span>
                  </button>
                  <button className={tab === "profile" ? "active" : ""} type="button" onClick={() => setTab("profile")}>
                    <UserIcon /><span>Profile</span>
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
        ) : (
          <>
        {tab === "discover" && <DiscoverScreen />}
        {tab === "connections" && <ConnectionsScreen />}
        {tab === "profile" && (
          <MyProfileScreen
            onPreviewOnboarding={() => setShowOnboarding(true)}
            onPrivacy={() => setShowPrivacy(true)}
          />
        )}
          </>
        )}

        <nav className="bottom-nav" aria-label="Primary navigation">
          <button className={tab === "discover" ? "active" : ""} type="button" onClick={() => setTab("discover")}>
            <CompassIcon /><span>Discover</span>
          </button>
          <button className={tab === "connections" ? "active" : ""} type="button" onClick={() => setTab("connections")}>
            <span className="nav-icon-wrap"><ConnectionIcon /> <i /></span><span>Connections</span>
          </button>
          <button className={tab === "profile" ? "active" : ""} type="button" onClick={() => setTab("profile")}>
            <UserIcon /><span>Profile</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
