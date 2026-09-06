import {
  adminConnectionDecisionResponseSchema,
  adminDecisionRequestSchema,
  adminDecisionResponseSchema,
  adminPendingConnectionListSchema,
  adminPhotoResponseSchema,
  adminQueueResponseSchema,
  adminSessionSchema,
  adminSubmissionDetailSchema,
  type AdminConnectionDecisionResponse,
  type AdminDecisionRequest,
  type AdminPendingConnection,
  type AdminQueueItem,
  type AdminSession,
  type AdminSubmissionDetail,
} from "@kidan/contracts";

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`Admin API error ${code} (${status})`);
    this.name = "AdminApiError";
  }
}

interface Envelope {
  data?: unknown;
  error?: { code?: string };
}

/**
 * Admin console API client. Authentication is a single HttpOnly session cookie
 * (set by the server on login); the CSRF token is returned in the body and sent
 * on every state-changing request via x-csrf-token. Credentials are always
 * included so the cookie travels same-origin through the /api proxy.
 */
export class AdminApiClient {
  private csrfToken: string | null = null;

  constructor(private readonly baseUrl = "/api") {}

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    withCsrf = false,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    const init: RequestInit = {
      method,
      credentials: "same-origin",
      cache: "no-store",
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    if (withCsrf && this.csrfToken) headers["x-csrf-token"] = this.csrfToken;
    init.headers = headers;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch {
      throw new AdminApiError("NETWORK", 0);
    }

    const envelope = (await response.json().catch(() => ({}))) as Envelope;
    if (!response.ok) {
      throw new AdminApiError(envelope.error?.code ?? "UNKNOWN", response.status);
    }
    return envelope.data as T;
  }

  async login(password: string): Promise<AdminSession> {
    const data = await this.request("POST", "/v1/admin/session", { password });
    const session = adminSessionSchema.parse(data);
    this.csrfToken = session.csrfToken;
    return session;
  }

  /** Restore an existing cookie session on load. Returns null when logged out. */
  async restoreSession(): Promise<AdminSession | null> {
    try {
      const data = await this.request("GET", "/v1/admin/session");
      const session = adminSessionSchema.parse(data);
      this.csrfToken = session.csrfToken;
      return session;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) return null;
      throw error;
    }
  }

  async listQueue(): Promise<AdminQueueItem[]> {
    const data = await this.request("GET", "/v1/admin/submissions");
    return adminQueueResponseSchema.parse(data).items;
  }

  async getSubmission(publicCode: string): Promise<AdminSubmissionDetail> {
    const data = await this.request("GET", `/v1/admin/submissions/${encodeURIComponent(publicCode)}`);
    return adminSubmissionDetailSchema.parse(data);
  }

  async getPhoto(publicCode: string): Promise<{ mediaType: string; dataUrl: string }> {
    const data = await this.request("GET", `/v1/admin/submissions/${encodeURIComponent(publicCode)}/photo`);
    return adminPhotoResponseSchema.parse(data);
  }

  async decide(publicCode: string, decision: AdminDecisionRequest): Promise<{ reviewStatus: string }> {
    const parsed = adminDecisionRequestSchema.parse(decision);
    const data = await this.request(
      "POST",
      `/v1/admin/submissions/${encodeURIComponent(publicCode)}/decision`,
      parsed,
      true,
    );
    return adminDecisionResponseSchema.parse(data);
  }

  /** Track D: mutually-interested pairs awaiting administrator approval. */
  async listPendingConnections(): Promise<AdminPendingConnection[]> {
    const data = await this.request("GET", "/v1/admin/connections");
    return adminPendingConnectionListSchema.parse(data).connections;
  }

  /** Administrator approves or rejects a pending connection. */
  async decideConnection(id: string, decision: "approved" | "rejected"): Promise<AdminConnectionDecisionResponse> {
    const data = await this.request(
      "POST",
      `/v1/admin/connections/${encodeURIComponent(id)}/decision`,
      { decision },
      true,
    );
    return adminConnectionDecisionResponseSchema.parse(data);
  }

  async logout(): Promise<void> {
    try {
      await this.request("POST", "/v1/admin/session/logout", {}, true);
    } finally {
      this.csrfToken = null;
    }
  }

  getCsrfToken(): string | null {
    return this.csrfToken;
  }
}
