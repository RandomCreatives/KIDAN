import type {
  ApiErrorBody,
  DraftResponse,
  DraftSaveResponse,
  SessionStatus,
  TelegramAuthResponse,
} from "@kidan/contracts";

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(code: string, status: number, requestId?: string) {
    super(`Kidan API error ${code} (${status})`);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

interface Envelope<T> {
  data?: T;
  error?: ApiErrorBody;
}

export class KidanApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "/api";
    const injected = options.fetchImpl;
    if (!injected) {
      if (typeof fetch === "undefined") {
        throw new Error("fetch is not available in this environment");
      }
      this.fetchImpl = fetch;
    } else {
      this.fetchImpl = injected;
    }
  }

  async authenticateWithTelegram(initData: string): Promise<TelegramAuthResponse> {
    return this.request<TelegramAuthResponse>("POST", "/v1/auth/telegram", { initData });
  }

  async getSession(): Promise<SessionStatus> {
    return this.request<SessionStatus>("GET", "/v1/session");
  }

  async logout(csrfToken: string): Promise<void> {
    await this.request<void>("POST", "/v1/session/logout", undefined, csrfToken);
  }

  async getDraft(): Promise<DraftResponse> {
    return this.request<DraftResponse>("GET", "/v1/onboarding/draft");
  }

  async saveDraft(patch: unknown, csrfToken: string): Promise<DraftSaveResponse> {
    return this.request<DraftSaveResponse>("PUT", "/v1/onboarding/draft", patch, csrfToken);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    csrfToken?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (csrfToken) headers["x-csrf-token"] = csrfToken;

    const init: RequestInit = { method, headers, credentials: "include" };
    if (payload !== undefined) init.body = payload;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as Envelope<T>) : {};

    if (!response.ok) {
      const error = parsed.error;
      throw new ApiError(error?.code ?? "INTERNAL_ERROR", response.status, error?.requestId);
    }

    if (parsed.data === undefined) return undefined as unknown as T;
    return parsed.data;
  }
}
