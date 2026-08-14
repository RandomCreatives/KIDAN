import { useState } from "react";
import { ConnectionsScreen } from "./components/ConnectionsScreen";
import { DiscoverScreen } from "./components/DiscoverScreen";
import { MyProfileScreen } from "./components/MyProfileScreen";
import { CompassIcon, ConnectionIcon, UserIcon } from "./components/Icons";
import { useAuth } from "./auth/useAuth";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { PilotDisabledScreen } from "./PilotDisabledScreen";

type Tab = "discover" | "connections" | "profile";

export function App() {
  const { isDemo } = useAuth();
  const [tab, setTab] = useState<Tab>("discover");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [draftSaved, setDraftSaved] = useState(false);

  if (showOnboarding) {
    return (
      <div className="app-shell">
        <div className="app-viewport onboarding-viewport">
          <OnboardingFlow
            mode={isDemo ? "demo" : "real"}
            onExit={(saved) => {
              if (saved) setDraftSaved(true);
              setShowOnboarding(false);
            }}
            onComplete={() => setShowOnboarding(false)}
          />
        </div>
      </div>
    );
  }

  if (!isDemo) {
    return (
      <div className="app-shell">
        <div className="app-viewport">
          <PilotDisabledScreen onReopen={() => setShowOnboarding(true)} saved={draftSaved} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-viewport">
        {tab === "discover" && <DiscoverScreen />}
        {tab === "connections" && <ConnectionsScreen />}
        {tab === "profile" && <MyProfileScreen onPreviewOnboarding={() => setShowOnboarding(true)} />}

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
