import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, KidanApiClient } from "../api/client.js";
import { resolveSession, type BootstrapResult } from "./sessionBootstrap.js";
import type { AuthStatus } from "./authState.js";

const CSRF_KEY = "kidan_csrf";

export interface AuthContextValue {
  status: AuthStatus;
  csrfToken: string | null;
  isDemo: boolean;
  profileStatus: string | null;
  logoutError: string | null;
  logout: () => Promise<void>;
  retry: () => Promise<void>;
  invalidate: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function getInitData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

let memoryCsrf: string | null = null;

function loadCsrf(): string | null {
  try {
    return sessionStorage.getItem(CSRF_KEY);
  } catch {
    return memoryCsrf;
  }
}

function saveCsrf(token: string | null): void {
  memoryCsrf = token;
  try {
    if (token) sessionStorage.setItem(CSRF_KEY, token);
    else sessionStorage.removeItem(CSRF_KEY);
  } catch {
    // in-memory fallback only
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isTelegram = Boolean(window.Telegram?.WebApp);
  const clientRef = useRef(new KidanApiClient());
  const opIdRef = useRef(0);
  const [status, setStatus] = useState<AuthStatus>(isTelegram ? "initializing" : "authenticated");
  const [csrfToken, setCsrfToken] = useState<string | null>(isTelegram ? null : "demo");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const commit = useCallback((result: BootstrapResult) => {
    if (result.kind === "authenticated") {
      saveCsrf(result.csrfToken);
      setCsrfToken(result.csrfToken);
      setProfileStatus(result.profileStatus);
      setStatus("authenticated");
    } else if (result.kind === "unauthenticated") {
      setStatus("unauthenticated");
    } else if (result.kind === "unavailable") {
      setStatus("unavailable");
    } else {
      setStatus(result.status);
    }
  }, []);

  const runBootstrap = useCallback(async () => {
    const myOp = ++opIdRef.current;
    setLogoutError(null);
    setStatus((current) => (current === "authenticated" ? "authenticated" : "initializing"));
    const result = await resolveSession({
      getSession: clientRef.current.getSession,
      authenticateWithTelegram: clientRef.current.authenticateWithTelegram,
      getInitData,
      onAuthenticating: () => {
        if (opIdRef.current === myOp) setStatus("authenticating");
      },
    });
    if (myOp !== opIdRef.current) return;
    commit(result);
  }, [commit]);

  useEffect(() => {
    if (!isTelegram) {
      setStatus("authenticated");
      setCsrfToken("demo");
      return;
    }
    void runBootstrap();
  }, [isTelegram, runBootstrap]);

  const logout = useCallback(async () => {
    if (!isTelegram) {
      setStatus("unauthenticated");
      return;
    }
    const token = loadCsrf();
    if (!token) {
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus("unauthenticated");
      return;
    }
    setLogoutError(null);
    try {
      await clientRef.current.logout(token);
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus("unauthenticated");
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
        saveCsrf(null);
        setCsrfToken(null);
        setProfileStatus(null);
        setStatus("unauthenticated");
        return;
      }
      setLogoutError("Could not sign out. Please try again.");
    }
  }, [isTelegram]);

  const invalidate = useCallback(() => {
    opIdRef.current += 1;
    saveCsrf(null);
    setCsrfToken(null);
    setProfileStatus(null);
    setStatus("expired");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        csrfToken,
        isDemo: !isTelegram,
        profileStatus,
        logoutError,
        logout,
        retry: runBootstrap,
        invalidate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
