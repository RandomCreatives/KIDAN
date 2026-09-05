import type { ClientErrorCode } from "../api/client.js";

export type AuthStatus =
  | "initializing"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "expired"
  | "unavailable"
  | "service_unavailable"
  | "fatal";

export function mapErrorToStatus(code: ClientErrorCode, httpStatus: number): AuthStatus {
  if (code === "UNAUTHENTICATED" || httpStatus === 401) return "expired";
  if (code === "ACCOUNT_UNAVAILABLE") return "unavailable";
  if (code === "REAL_SUBMISSIONS_DISABLED") return "unavailable";
  // 503 / SERVICE_NOT_READY is a server-side condition (e.g. the database is
  // not migrated yet). Distinguish it from a network failure so the user is
  // not told their own connection is broken.
  if (code === "SERVICE_NOT_READY" || httpStatus === 503) return "service_unavailable";
  if (code === "INVALID_CSRF") return "fatal";
  if (httpStatus >= 500) return "fatal";
  return "fatal";
}
