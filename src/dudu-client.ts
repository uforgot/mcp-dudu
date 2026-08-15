export type JsonObject = Record<string, unknown>;

export interface DuduClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class DuduApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "DuduApiError";
  }
}

export class DuduClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ baseUrl, apiKey, fetchImpl = fetch }: DuduClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.execute<T>(path, init);
  }

  private async execute<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const detail = body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : response.statusText;
      throw new DuduApiError(`Dudu API ${response.status}: ${detail}`, response.status, body);
    }

    return body as T;
  }
}
