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
  retry: () => void;
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

function clearLocalSession(): void {
  saveCsrf(null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isTelegram = Boolean(window.Telegram?.WebApp && window.Telegram.WebApp.initData);
  const clientRef = useRef(new KidanApiClient());
  const bootstrapPromiseRef = useRef<Promise<BootstrapResult> | null>(null);
  const generationRef = useRef(0);
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
      clearLocalSession();
      setStatus("unauthenticated");
    } else if (result.kind === "unavailable") {
      clearLocalSession();
      setStatus("unavailable");
    } else {
      setStatus(result.status);
    }
  }, []);

  const runBootstrap = useCallback(async (): Promise<BootstrapResult> => {
    const myGeneration = generationRef.current;
    setLogoutError(null);
    setStatus((current) => (current === "authenticated" ? "authenticated" : "initializing"));

    if (bootstrapPromiseRef.current) return bootstrapPromiseRef.current;

    const bootstrapPromise = (async (): Promise<BootstrapResult> => {
      const result = await resolveSession({
        getSession: () => clientRef.current.getSession(),
        authenticateWithTelegram: (initData: string) => clientRef.current.authenticateWithTelegram(initData),
        getInitData,
        onAuthenticating: () => {
          if (generationRef.current === myGeneration) setStatus("authenticating");
        },
      });
      return result;
    })();

    bootstrapPromiseRef.current = bootstrapPromise;
    const result = await bootstrapPromise;
    if (bootstrapPromiseRef.current === bootstrapPromise) bootstrapPromiseRef.current = null;
    if (generationRef.current === myGeneration) commit(result);
    return result;
  }, [commit]);

  useEffect(() => {
    if (!isTelegram) {
      clearLocalSession();
      setStatus("authenticated");
      setCsrfToken("demo");
      return;
    }
    void runBootstrap();
  }, [isTelegram, runBootstrap]);

  const logout = useCallback(async () => {
    if (!isTelegram) {
      clearLocalSession();
      setStatus("unauthenticated");
      return;
    }
    setLogoutError(null);
    let token = loadCsrf();
    try {
      if (!token) {
        const session = await clientRef.current.getSession();
        token = session.csrfToken;
      }
      await clientRef.current.logout(token);
      clearLocalSession();
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus("unauthenticated");
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
        clearLocalSession();
        setCsrfToken(null);
        setProfileStatus(null);
        setStatus("unauthenticated");
        return;
      }
      setLogoutError("Could not sign out. Please try again.");
    }
  }, [isTelegram]);

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    bootstrapPromiseRef.current = null;
    clearLocalSession();
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
        retry: () => {
          void runBootstrap();
        },
        invalidate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
