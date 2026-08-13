import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, KidanApiClient } from "../api/client.js";
import { mapErrorToStatus, type AuthStatus } from "./authState.js";

const CSRF_KEY = "kidan_csrf";

export interface AuthContextValue {
  status: AuthStatus;
  csrfToken: string | null;
  isDemo: boolean;
  profileStatus: string | null;
  logout: () => Promise<void>;
  retry: () => Promise<void>;
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

function statusFromError(error: unknown): AuthStatus {
  if (error instanceof ApiError) return mapErrorToStatus(error.code, error.status);
  return "fatal";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isTelegram = Boolean(window.Telegram?.WebApp);
  const clientRef = useRef(new KidanApiClient());
  const [status, setStatus] = useState<AuthStatus>(isTelegram ? "initializing" : "authenticated");
  const [csrfToken, setCsrfToken] = useState<string | null>(isTelegram ? null : "demo");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);

  const restoreOrAuthenticate = useCallback(async () => {
    const client = clientRef.current;
    try {
      const session = await client.getSession();
      saveCsrf(session.csrfToken);
      setCsrfToken(session.csrfToken);
      setProfileStatus(session.profileStatus);
      setStatus("authenticated");
      return;
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "UNAUTHENTICATED")) {
        setStatus(statusFromError(error));
        return;
      }
    }

    const initData = getInitData();
    if (!initData) {
      setStatus("unauthenticated");
      return;
    }
    try {
      const issued = await client.authenticateWithTelegram(initData);
      saveCsrf(issued.csrfToken);
      setCsrfToken(issued.csrfToken);
      setProfileStatus(issued.profileStatus);
      setStatus("authenticated");
    } catch (authError) {
      if (authError instanceof ApiError && authError.code === "ACCOUNT_UNAVAILABLE") {
        setStatus("unavailable");
      } else {
        setStatus(statusFromError(authError));
      }
    }
  }, []);

  useEffect(() => {
    if (!isTelegram) {
      setStatus("authenticated");
      setCsrfToken("demo");
      return;
    }
    void restoreOrAuthenticate();
  }, [isTelegram, restoreOrAuthenticate]);

  const logout = useCallback(async () => {
    if (!isTelegram) {
      setStatus("unauthenticated");
      return;
    }
    const token = loadCsrf();
    try {
      if (token) await clientRef.current.logout(token);
    } catch {
      // ignore transport errors; clear local state regardless
    }
    saveCsrf(null);
    setCsrfToken(null);
    setStatus("unauthenticated");
  }, [isTelegram]);

  return (
    <AuthContext.Provider
      value={{
        status,
        csrfToken,
        isDemo: !isTelegram,
        profileStatus,
        logout,
        retry: restoreOrAuthenticate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
