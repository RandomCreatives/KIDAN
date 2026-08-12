import { useState } from "react";
import { ConnectionsScreen } from "./components/ConnectionsScreen";
import { DiscoverScreen } from "./components/DiscoverScreen";
import { MyProfileScreen } from "./components/MyProfileScreen";
import { CompassIcon, ConnectionIcon, UserIcon } from "./components/Icons";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";

type Tab = "discover" | "connections" | "profile";

export function App() {
  const [tab, setTab] = useState<Tab>("discover");
  const [showOnboarding, setShowOnboarding] = useState(true);

  if (showOnboarding) {
    return (
      <div className="app-shell">
        <div className="app-viewport onboarding-viewport">
          <OnboardingFlow
            onExit={() => setShowOnboarding(false)}
            onComplete={() => {
              setShowOnboarding(false);
              setTab("profile");
            }}
          />
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
