import {
  apiErrorCodeSchema,
  apiErrorEnvelopeSchema,
  candidateReviewStatusSchema,
  type CandidateReviewStatus,
  dataExportResponseSchema,
  type DataExportResponse,
  connectionConfirmRequestSchema,
  connectionConfirmResponseSchema,
  connectionListResponseSchema,
  introductionPostRequestSchema,
  introductionPostResponseSchema,
  introductionThreadResponseSchema,
  type IntroductionPostRequest,
  type IntroductionThread,
  discoveryDecisionRequestSchema,
  discoveryFeedResponseSchema,
  type ConnectionConfirmResponse,
  type ConnectionListResponse,
  type DiscoveryFeedResponse,
  type DiscoveryDecisionRequest,
  draftResponseSchema,
  draftSaveResponseSchema,
  type ApiErrorCode,
  type ApiErrorBody,
  type DraftResponse,
  type DraftSaveResponse,
  type OnboardingProgressPatch,
  onboardingProgressPatchSchema,
  onboardingSubmitRequestSchema,
  onboardingSubmitResponseSchema,
  verificationPhotoUploadSchema,
  type OnboardingSubmitRequest,
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
  readonly networkCause: string | undefined;
  readonly configuredBotId: string | undefined;
  readonly tokenProbe: { ok: boolean; id?: number; username?: string; reason?: string } | undefined;

  constructor(code: ClientErrorCode, status: number, requestId?: string, networkCause?: string, configuredBotId?: string, tokenProbe?: { ok: boolean; id?: number; username?: string; reason?: string }) {
    super(`Kidan API error ${code} (${status})`);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.networkCause = networkCause;
    this.configuredBotId = configuredBotId;
    this.tokenProbe = tokenProbe;
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
      // Native fetch must be invoked with the global object as its receiver;
      // calling it later as `this.fetchImpl(...)` detaches it and throws
      // "Illegal invocation" (observed in the Telegram WebView). Bind it.
      this.fetchImpl = fetch.bind(globalThis);
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

  async submitDraft(submission: OnboardingSubmitRequest, csrfToken: string): Promise<{ status: "profile_pending" }> {
    const validated = onboardingSubmitRequestSchema.safeParse(submission);
    if (!validated.success) throw new ApiError("INVALID_REQUEST", 400);
    const data = await this.request("POST", "/v1/onboarding/submit", validated.data, csrfToken, 202);
    return this.parse(onboardingSubmitResponseSchema, data);
  }

  async savePrivateIdentity(
    identity: { fullName: string; dateOfBirth: string; phoneNumber: string },
    csrfToken: string,
  ): Promise<void> {
    await this.request("PUT", "/v1/onboarding/private-identity", identity, csrfToken, 204);
  }

  async uploadVerificationPhoto(dataUrl: string, csrfToken: string): Promise<void> {
    const validated = verificationPhotoUploadSchema.safeParse({ dataUrl });
    if (!validated.success) throw new ApiError("INVALID_REQUEST", 400);
    await this.request("PUT", "/v1/onboarding/verification-photo", validated.data, csrfToken, 204);
  }

  /** The caller's own profile-review status (B4). Session-scoped. */
  async getReviewStatus(): Promise<CandidateReviewStatus> {
    const data = await this.request("GET", "/v1/onboarding/review-status");
    return this.parse(candidateReviewStatusSchema, data);
  }

  /** The caller's own complete data bundle (B6). Session-scoped. */
  async exportData(): Promise<DataExportResponse> {
    const data = await this.request("GET", "/v1/onboarding/export");
    return this.parse(dataExportResponseSchema, data);
  }

  /** Permanently deletes the caller's account and all personal data (B6). */
  async deleteAccount(csrfToken: string): Promise<void> {
    await this.request("POST", "/v1/onboarding/delete-account", { confirm: true }, csrfToken, 200);
  }

  /** Values-only discovery feed (Track C). Returns [] when submissions are disabled. */
  async getDiscoveryFeed(): Promise<DiscoveryFeedResponse> {
    const data = await this.request("GET", "/v1/discovery/feed");
    return this.parse(discoveryFeedResponseSchema, data);
  }

  /** Records a pass/interested discovery decision (idempotent per target). */
  async recordDiscoveryDecision(decision: DiscoveryDecisionRequest, csrfToken: string): Promise<void> {
    const validated = discoveryDecisionRequestSchema.parse(decision);
    await this.request("POST", "/v1/discovery/decision", validated, csrfToken);
  }

  /** The participant's connections (values-only; admin approval onward). */
  async getConnections(): Promise<ConnectionListResponse> {
    const data = await this.request("GET", "/v1/connections");
    return this.parse(connectionListResponseSchema, data);
  }

  /** Final participant confirmation/decline after admin approval. */
  async confirmConnection(connectionId: string, confirm: boolean, csrfToken: string): Promise<ConnectionConfirmResponse> {
    const data = await this.request(
      "POST",
      `/v1/connections/${connectionId}/confirm`,
      connectionConfirmRequestSchema.parse({ confirm }),
      csrfToken,
    );
    return this.parse(connectionConfirmResponseSchema, data);
  }

  /** Restricted in-app introduction thread for a connected pair (values-only). */
  async getIntroduction(connectionId: string): Promise<IntroductionThread> {
    const data = await this.request("GET", `/v1/connections/${connectionId}/introduction`);
    return this.parse(introductionThreadResponseSchema, data);
  }

  /** Posts a moderated introduction message; contact details are rejected. */
  async postIntroduction(connectionId: string, body: string, csrfToken: string): Promise<IntroductionThread["messages"][number]> {
    const payload: IntroductionPostRequest = introductionPostRequestSchema.parse({ body });
    const data = await this.request(
      "POST",
      `/v1/connections/${connectionId}/introduction`,
      payload,
      csrfToken,
    );
    return this.parse(introductionPostResponseSchema, data).message;
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
      const causeText =
        (error instanceof Error && error.message) ? error.message
        : typeof error === "string" ? error
        : "unknown fetch failure";
      const timedOut = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      throw new ApiError("NETWORK", 0, undefined, timedOut ? `timeout after ${this.requestTimeoutMs}ms` : causeText.slice(0, 120));
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
      throw new ApiError(code, response.status, envelope.data.error.requestId, undefined,
        (envelope.data.error as { configuredBotId?: string }).configuredBotId,
        (envelope.data.error as { tokenProbe?: { ok: boolean; id?: number; username?: string; reason?: string } }).tokenProbe);
    }

    if (expectStatus !== undefined && response.status !== expectStatus) {
      throw new ApiError("INVALID_RESPONSE", response.status);
    }

    return parsed.data;
  }
}
