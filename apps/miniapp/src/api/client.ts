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

export type ClientErrorCode = ApiErrorCode | "NETWORK";

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(code: ClientErrorCode, status: number, requestId?: string) {
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
  private readonly requestTimeoutMs: number;

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
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
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
    await this.request("POST", "/v1/session/logout", undefined, csrfToken, 204);
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
    expectStatus?: number,
  ): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (csrfToken) headers["x-csrf-token"] = csrfToken;

    // One controller and one timer cover both fetch() and response.text() so a
    // stalled response body cannot hang indefinitely any more than a stalled
    // connection can.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    const init: RequestInit = { method, headers, credentials: "include", signal: controller.signal };
    if (payload !== undefined) init.body = payload;

    let response: Response;
    let text = "";
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init);

      if (response.status === 204) {
        if (expectStatus !== undefined && response.status !== expectStatus) {
          throw new ApiError("INVALID_RESPONSE", response.status);
        }
        return undefined;
      }

      text = await response.text();
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw new ApiError("NETWORK", 0);
      }
      throw new ApiError("NETWORK", 0);
    } finally {
      clearTimeout(timeoutId);
    }

    let parsed: Envelope;
    try {
      parsed = text ? (JSON.parse(text) as Envelope) : {};
    } catch {
      throw new ApiError("INVALID_RESPONSE", response.status);
    }

    if (!response.ok) {
      const envelope = apiErrorEnvelopeSchema.safeParse(parsed);
      if (!envelope.success) throw new ApiError("INVALID_RESPONSE", response.status);
      const code = apiErrorCodeSchema.safeParse(envelope.data.error.code).data ?? "INVALID_RESPONSE";
      throw new ApiError(code, response.status, envelope.data.error.requestId);
    }

    if (expectStatus !== undefined && response.status !== expectStatus) {
      throw new ApiError("INVALID_RESPONSE", response.status);
    }

    return parsed.data;
  }
}
