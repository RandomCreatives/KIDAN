import { useCallback, useEffect, useState } from "react";
import { AdminApiClient } from "./api/client.js";
import type { AdminSession } from "@kidan/contracts";
import { LoginScreen } from "./components/LoginScreen.js";
import { ReviewConsole } from "./components/ReviewConsole.js";

type Phase = "loading" | "login" | "console";

export function App() {
  const [client] = useState(() => new AdminApiClient());
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .restoreSession()
      .then((restored) => {
        if (cancelled) return;
        if (restored) {
          setSession(restored);
          setPhase("console");
        } else {
          setPhase("login");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("login");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleLogin = useCallback(
    async (password: string) => {
      const restored = await client.login(password);
      setSession(restored);
      setPhase("console");
    },
    [client],
  );

  const handleLogout = useCallback(async () => {
    await client.logout().catch(() => undefined);
    setSession(null);
    setPhase("login");
  }, [client]);

  if (phase === "loading") {
    return (
      <div className="centered">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  if (phase === "login" || !session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <ReviewConsole client={client} label={session.label} onLogout={handleLogout} />;
}
