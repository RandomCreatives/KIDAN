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
  const authMutex = useRef<Promise<unknown>>(Promise.resolve());
  const generationRef = useRef(0);
  const loggingOutRef = useRef(false);
  const logoutInFlightRef = useRef(false);
  const [status, setStatus] = useState<AuthStatus>(isTelegram ? "initializing" : "authenticated");
  const [csrfToken, setCsrfToken] = useState<string | null>(isTelegram ? null : "demo");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const runExclusive = useCallback((fn: () => Promise<void>) => {
    const prev = authMutex.current;
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    authMutex.current = next;
    return prev.then(fn, fn).finally(() => release());
  }, []);

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

    let result: BootstrapResult = { kind: "unavailable" };
    const promise = (async () => {
      await runExclusive(async () => {
        result = await resolveSession({
          getSession: () => clientRef.current.getSession(),
          authenticateWithTelegram: (initData: string) => clientRef.current.authenticateWithTelegram(initData),
          getInitData,
          onAuthenticating: () => {
            if (generationRef.current === myGeneration) setStatus("authenticating");
          },
        });
        if (loggingOutRef.current) return;
        if (generationRef.current === myGeneration) commit(result);
      });
      return result;
    })();

    bootstrapPromiseRef.current = promise;
    const resolved = await promise;
    if (bootstrapPromiseRef.current === promise) bootstrapPromiseRef.current = null;
    if (loggingOutRef.current) return { kind: "unauthenticated" };
    return resolved;
  }, [commit, runExclusive]);

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
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    setLogoutError(null);
    generationRef.current += 1;
    try {
      await runExclusive(async () => {
        loggingOutRef.current = true;
        let token = loadCsrf();
        if (!token) {
          try {
            const session = await clientRef.current.getSession();
            token = session.csrfToken;
          } catch {
            token = null;
          }
        }
        if (!token) {
          // No usable session token: the user is already signed out.
          commit({ kind: "unauthenticated" });
          return;
        }
        try {
          await clientRef.current.logout(token);
          commit({ kind: "unauthenticated" });
        } catch (error) {
          const code = error instanceof ApiError ? error.code : "NETWORK";
          if (code === "UNAUTHENTICATED") {
            commit({ kind: "unauthenticated" });
            return;
          }
          // Revocation could not be confirmed: keep the user signed in and
          // surface a recoverable error instead of faking a signed-out state.
          setLogoutError("Couldn’t sign out. Please retry.");
          throw error;
        }
      });
    } catch {
      // Failure path already surfaced a logoutError; local state stays signed in.
    } finally {
      loggingOutRef.current = false;
      logoutInFlightRef.current = false;
    }
  }, [isTelegram, runExclusive]);

  const retry = useCallback(() => {
    if (loggingOutRef.current) return;
    void runBootstrap();
  }, [runBootstrap]);

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    bootstrapPromiseRef.current = null;
    void runExclusive(async () => {
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setStatus("expired");
    });
  }, [runExclusive]);

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
