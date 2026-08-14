import {
  apiErrorCodeSchema,
  apiErrorEnvelopeSchema,
  draftResponseSchema,
  draftSaveResponseSchema,
  type ApiErrorCode,
  type ApiErrorBody,
  type DraftResponse,
  type DraftSaveResponse,
  type OnboardingProgressPatch,
  onboardingProgressPatchSchema,
  sessionStatusSchema,
  type SessionStatus,
  telegramAuthResponseSchema,
  type TelegramAuthResponse,
} from "@kidan/contracts";
import { z } from "zod";

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(code: ApiErrorCode, status: number, requestId?: string) {
    super(`Kidan API error ${code} (${status})`);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

interface Envelope {
  data?: unknown;
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
    const data = await this.request("POST", "/v1/auth/telegram", { initData });
    return this.parse(telegramAuthResponseSchema, data);
  }

  async getSession(): Promise<SessionStatus> {
    const data = await this.request("GET", "/v1/session");
    return this.parse(sessionStatusSchema, data);
  }

  async logout(csrfToken: string): Promise<void> {
    await this.request("POST", "/v1/session/logout", undefined, csrfToken);
  }

  async getDraft(): Promise<DraftResponse> {
    const data = await this.request("GET", "/v1/onboarding/draft");
    return this.parse(draftResponseSchema, data);
  }

  async saveDraft(patch: OnboardingProgressPatch, csrfToken: string): Promise<DraftSaveResponse> {
    const validated = onboardingProgressPatchSchema.safeParse(patch);
    if (!validated.success) throw new ApiError("INVALID_REQUEST", 400);
    const data = await this.request("PUT", "/v1/onboarding/draft", validated.data, csrfToken);
    return this.parse(draftSaveResponseSchema, data);
  }

  private parse<T>(schema: z.ZodType<T>, data: unknown): T {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ApiError("INVALID_RESPONSE", 0);
    return parsed.data;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    csrfToken?: string,
  ): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (csrfToken) headers["x-csrf-token"] = csrfToken;

    const init: RequestInit = { method, headers, credentials: "include" };
    if (payload !== undefined) init.body = payload;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch {
      throw new ApiError("NETWORK", 0);
    }

    if (response.status === 204) return undefined;

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new ApiError("NETWORK", response.status);
    }

    let parsed: Envelope;
    try {
      parsed = text ? (JSON.parse(text) as Envelope) : {};
    } catch {
      throw new ApiError("INVALID_RESPONSE", response.status);
    }

    if (!response.ok) {
      const envelope = apiErrorEnvelopeSchema.safeParse(parsed);
      const rawCode = envelope.success ? envelope.data.error.code : parsed.error?.code;
      const code = apiErrorCodeSchema.safeParse(rawCode).data ?? "INVALID_RESPONSE";
      const requestId = envelope.success ? envelope.data.error.requestId : parsed.error?.requestId;
      throw new ApiError(code, response.status, requestId);
    }

    return parsed.data;
  }
}
