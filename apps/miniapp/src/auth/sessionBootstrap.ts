import type { SessionStatus, TelegramAuthResponse } from "@kidan/contracts";
import { ApiError } from "../api/client.js";
import { mapErrorToStatus, type AuthStatus } from "./authState.js";

export interface BootstrapDeps {
  getSession: () => Promise<SessionStatus>;
  authenticateWithTelegram: (initData: string) => Promise<TelegramAuthResponse>;
  getInitData: () => string;
  canAuthenticate?: () => boolean;
  onAuthenticating?: () => void;
}

export type BootstrapResult =
  | { kind: "authenticated"; csrfToken: string; profileStatus: SessionStatus["profileStatus"] }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" }
  | { kind: "error"; status: AuthStatus; detail: string };

export function describeAuthError(error: unknown): { status: AuthStatus; detail: string } {
  if (error instanceof ApiError) {
    return { status: mapErrorToStatus(error.code, error.status), detail: `${error.code} (HTTP ${error.status})` };
  }
  const name = error instanceof Error ? error.name : typeof error;
  return { status: "fatal", detail: `network/unknown (${name})` };
}

export async function resolveSession(deps: BootstrapDeps): Promise<BootstrapResult> {
  try {
    const session = await deps.getSession();
    return { kind: "authenticated", csrfToken: session.csrfToken, profileStatus: session.profileStatus };
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
      const initData = deps.getInitData();
      if (!initData || deps.canAuthenticate?.() === false) return { kind: "unauthenticated" };
      deps.onAuthenticating?.();
      try {
        const issued = await deps.authenticateWithTelegram(initData);
        return { kind: "authenticated", csrfToken: issued.csrfToken, profileStatus: issued.profileStatus };
      } catch (authError) {
        if (authError instanceof ApiError && authError.code === "ACCOUNT_UNAVAILABLE") {
          return { kind: "unavailable" };
        }
        return { kind: "error", ...describeAuthError(authError) };
      }
    }
    return { kind: "error", ...describeAuthError(error) };
  }
}
