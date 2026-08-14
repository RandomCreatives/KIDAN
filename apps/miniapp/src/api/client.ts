import {
  apiErrorCodeSchema,
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

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);

    if (response.status === 204) return undefined;

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as Envelope) : {};

    if (!response.ok) {
      const rawCode = parsed.error?.code;
      const code = apiErrorCodeSchema.safeParse(rawCode).data ?? "INVALID_RESPONSE";
      throw new ApiError(code, response.status, parsed.error?.requestId);
    }

    return parsed.data;
  }
}
