import type { ClientErrorCode } from "../api/client.js";

export type AuthStatus =
  | "initializing"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "expired"
  | "unavailable"
  | "fatal";

export function mapErrorToStatus(code: ClientErrorCode, httpStatus: number): AuthStatus {
  if (code === "UNAUTHENTICATED" || httpStatus === 401) return "expired";
  if (code === "ACCOUNT_UNAVAILABLE") return "unavailable";
  if (code === "REAL_SUBMISSIONS_DISABLED") return "unavailable";
  if (code === "SERVICE_NOT_READY") return "fatal";
  if (code === "INVALID_CSRF") return "fatal";
  if (httpStatus >= 500) return "fatal";
  return "fatal";
}
