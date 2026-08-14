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
  const loggingOutRef = useRef(false);
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
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus("unauthenticated");
    } else if (result.kind === "unavailable") {
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus("unavailable");
    } else {
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus(result.status);
    }
  }, []);

  const runBootstrap = useCallback(async (): Promise<BootstrapResult> => {
    if (loggingOutRef.current) return { kind: "unauthenticated" };
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
    if (loggingOutRef.current) return { kind: "unauthenticated" };
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
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus("unauthenticated");
      return;
    }
    setLogoutError(null);
    const inFlight = bootstrapPromiseRef.current;
    generationRef.current += 1;
    loggingOutRef.current = true;
    try {
      if (inFlight) await inFlight.catch(() => undefined);
      let token = loadCsrf();
      if (!token) {
        try {
          const session = await clientRef.current.getSession();
          token = session.csrfToken;
        } catch {
          token = null;
        }
      }
      if (token) await clientRef.current.logout(token).catch(() => undefined);
    } finally {
      bootstrapPromiseRef.current = null;
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus("unauthenticated");
      loggingOutRef.current = false;
    }
  }, [isTelegram]);

  const retry = useCallback(() => {
    if (loggingOutRef.current) return;
    void runBootstrap();
  }, [runBootstrap]);

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    loggingOutRef.current = true;
    bootstrapPromiseRef.current = null;
    saveCsrf(null);
    setCsrfToken(null);
    setProfileStatus(null);
    setStatus("expired");
    loggingOutRef.current = false;
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
        retry,
        invalidate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
