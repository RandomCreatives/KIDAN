import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, KidanApiClient, type ClientErrorCode } from "../api/client.js";
import { resolveSession, type BootstrapResult } from "./sessionBootstrap.js";
import type { AuthStatus } from "./authState.js";

const CSRF_KEY = "kidan_csrf";

type AuthLifecyclePhase = "active" | "logout-pending" | "signed-out";

export type LogoutResult =
  | { success: true; reason: "revoked" | "already-absent" }
  | { success: false; reason: "unconfirmed"; code: ClientErrorCode };

export interface AuthContextValue {
  status: AuthStatus;
  csrfToken: string | null;
  isDemo: boolean;
  profileStatus: string | null;
  lastError: string | null;
  logoutError: string | null;
  loggingOut: boolean;
  logout: () => Promise<LogoutResult>;
  retry: () => Promise<BootstrapResult>;
  invalidate: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function getInitData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

function saveCsrf(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(CSRF_KEY, token);
    else sessionStorage.removeItem(CSRF_KEY);
  } catch {
    // React state remains the in-memory value when sessionStorage is unavailable.
  }
}

function clearLocalSession(): void {
  saveCsrf(null);
}

function clientErrorCode(error: unknown): ClientErrorCode {
  return error instanceof ApiError ? error.code : "NETWORK";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isTelegram = Boolean(window.Telegram?.WebApp && window.Telegram.WebApp.initData);
  const clientRef = useRef<KidanApiClient | null>(null);
  clientRef.current ??= new KidanApiClient();
  const client = clientRef.current;
  const operationTailRef = useRef<Promise<void>>(Promise.resolve());
  const bootstrapPromiseRef = useRef<Promise<BootstrapResult> | null>(null);
  const logoutPromiseRef = useRef<Promise<LogoutResult> | null>(null);
  const lifecycleRef = useRef<AuthLifecyclePhase>("active");
  const generationRef = useRef(0);
  const initialStatus: AuthStatus = isTelegram ? "initializing" : "authenticated";
  const [status, setStatus] = useState<AuthStatus>(initialStatus);
  const statusRef = useRef<AuthStatus>(initialStatus);
  const [csrfToken, setCsrfToken] = useState<string | null>(isTelegram ? null : "demo");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const updateStatus = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const runExclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = operationTailRef.current.then(fn, fn);
    operationTailRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const commit = useCallback((result: BootstrapResult) => {
    if (result.kind === "authenticated") {
      saveCsrf(result.csrfToken);
      setCsrfToken(result.csrfToken);
      setProfileStatus(result.profileStatus);
      setLastError(null);
      updateStatus("authenticated");
    } else if (result.kind === "unauthenticated") {
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setLastError(null);
      updateStatus("unauthenticated");
    } else if (result.kind === "unavailable") {
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setLastError(null);
      updateStatus("unavailable");
    } else {
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      setLastError(result.detail);
      updateStatus(result.status);
    }
  }, [updateStatus]);

  const runBootstrap = useCallback((): Promise<BootstrapResult> => {
    if (lifecycleRef.current !== "active") {
      return Promise.resolve({ kind: "unauthenticated" });
    }
    if (bootstrapPromiseRef.current) return bootstrapPromiseRef.current;

    const myGeneration = generationRef.current;
    setLogoutError(null);
    if (statusRef.current !== "authenticated") updateStatus("initializing");

    const promise = runExclusive(async () => {
      if (lifecycleRef.current !== "active") return { kind: "unauthenticated" } as const;
      const result = await resolveSession({
        getSession: () => client.getSession(),
        authenticateWithTelegram: (initData: string) => client.authenticateWithTelegram(initData),
        getInitData,
        canAuthenticate: () => lifecycleRef.current === "active" && generationRef.current === myGeneration,
        onAuthenticating: () => {
          if (lifecycleRef.current === "active" && generationRef.current === myGeneration) {
            updateStatus("authenticating");
          }
        },
      });
      if (lifecycleRef.current === "active" && generationRef.current === myGeneration) commit(result);
      return result;
    });

    bootstrapPromiseRef.current = promise;
    void promise.finally(() => {
      if (bootstrapPromiseRef.current === promise) bootstrapPromiseRef.current = null;
    });
    return promise;
  }, [commit, runExclusive, updateStatus]);

  useEffect(() => {
    if (!isTelegram) {
      clearLocalSession();
      updateStatus("authenticated");
      setCsrfToken("demo");
      return;
    }
    void runBootstrap();
  }, [isTelegram, runBootstrap, updateStatus]);

  const logout = useCallback((): Promise<LogoutResult> => {
    if (!isTelegram) {
      lifecycleRef.current = "signed-out";
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      updateStatus("unauthenticated");
      return Promise.resolve({ success: true, reason: "revoked" });
    }
    if (logoutPromiseRef.current) return logoutPromiseRef.current;
    if (lifecycleRef.current === "signed-out") {
      return Promise.resolve({ success: true, reason: "already-absent" });
    }

    // Establish terminal intent synchronously. No retry/invalidation started after
    // this point may enqueue an authentication behind the revocation operation.
    lifecycleRef.current = "logout-pending";
    generationRef.current += 1;
    setLogoutError(null);
    setLoggingOut(true);

    const markSignedOut = (reason: "revoked" | "already-absent"): LogoutResult => {
      lifecycleRef.current = "signed-out";
      commit({ kind: "unauthenticated" });
      return { success: true, reason };
    };

    const markUnconfirmed = (error: unknown): LogoutResult => {
      const code = clientErrorCode(error);
      lifecycleRef.current = "active";
      setLogoutError("Couldn’t sign out because server revocation was not confirmed. Please retry.");
      if (statusRef.current !== "authenticated") updateStatus("fatal");
      return { success: false, reason: "unconfirmed", code };
    };

    const restoreFinalSession = async () => {
      try {
        return await client.getSession();
      } catch (error) {
        if (error instanceof ApiError && error.code === "UNAUTHENTICATED") return null;
        throw error;
      }
    };

    const operation = runExclusive(async (): Promise<LogoutResult> => {
      let session;
      try {
        // Stored CSRF can belong to an older cookie. GET the final cookie-backed
        // session after all earlier auth work settles and use only its token.
        session = await restoreFinalSession();
      } catch (error) {
        return markUnconfirmed(error);
      }

      // At most two revocation attempts are permitted. Only the first
      // INVALID_CSRF response may refresh the final cookie-backed session.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!session) return markSignedOut("already-absent");
        commit({
          kind: "authenticated",
          csrfToken: session.csrfToken,
          profileStatus: session.profileStatus,
        });

        try {
          await client.logout(session.csrfToken);
          return markSignedOut("revoked");
        } catch (error) {
          if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
            return markSignedOut("already-absent");
          }
          if (!(error instanceof ApiError) || error.code !== "INVALID_CSRF" || attempt === 1) {
            return markUnconfirmed(error);
          }
        }

        try {
          session = await restoreFinalSession();
        } catch (error) {
          return markUnconfirmed(error);
        }
      }

      // The loop returns for every success and failure path.
      return markUnconfirmed(new ApiError("INVALID_CSRF", 403));
    });

    const shared = operation.finally(() => {
      logoutPromiseRef.current = null;
      if (lifecycleRef.current === "logout-pending") lifecycleRef.current = "active";
      setLoggingOut(false);
    });
    logoutPromiseRef.current = shared;
    return shared;
  }, [commit, isTelegram, runExclusive, updateStatus]);

  const retry = useCallback((): Promise<BootstrapResult> => runBootstrap(), [runBootstrap]);

  const invalidate = useCallback((): Promise<void> => {
    if (lifecycleRef.current !== "active") return Promise.resolve();
    generationRef.current += 1;
    return runExclusive(async () => {
      if (lifecycleRef.current !== "active") return;
      saveCsrf(null);
      setCsrfToken(null);
      setProfileStatus(null);
      updateStatus("expired");
    });
  }, [runExclusive, updateStatus]);

  return (
    <AuthContext.Provider
      value={{
        status,
        csrfToken,
        isDemo: !isTelegram,
        profileStatus,
        lastError,
        logoutError,
        loggingOut,
        logout,
        retry,
        invalidate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
