import { buildHttpError, normalizeNetworkError } from "../../appErrorUtils";
import type { AppErrorCode } from "../../../../src/shared/app-error";

type ResponseFormat = "json" | "text" | "void";

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 30_000;
const SEND_MESSAGE_TIMEOUT_MS = 300_000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1_000;

export class KindroidApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: AppErrorCode = "provider.kindroid_http_error"
  ) {
    super(message);
    this.name = "KindroidApiError";
  }

  get isRetryable(): boolean {
    return RETRYABLE_STATUS_CODES.has(this.statusCode);
  }
}

function parseTextResponse(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return parsed;
      }
    } catch {
      // Fall through and return the raw trimmed text.
    }
  }

  return trimmed;
}

export class KindroidHttpClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string
  ) {}

  async request<T>(
    endpoint: string,
    body: Record<string, unknown>,
    format: "json",
    timeoutMs?: number
  ): Promise<T>;
  async request(
    endpoint: string,
    body: Record<string, unknown>,
    format: "text",
    timeoutMs?: number
  ): Promise<string>;
  async request(
    endpoint: string,
    body: Record<string, unknown>,
    format: "void",
    timeoutMs?: number
  ): Promise<void>;
  async request<T>(
    endpoint: string,
    body: Record<string, unknown>,
    format: ResponseFormat,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<T | string | void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw normalizeNetworkError({
        error,
        provider: "kindroid",
        fallbackMessage: "Kindroid request",
        fallbackCode: "provider.kindroid_http_error"
      });
    }

    if (!response.ok) {
      const appError = await buildHttpError({
        response,
        provider: "kindroid",
        code: "provider.kindroid_http_error",
        fallbackMessage: "Kindroid request failed"
      });
      throw new KindroidApiError(response.status, appError.message, appError.code);
    }

    switch (format) {
      case "void":
        return;
      case "text":
        return parseTextResponse(await response.text());
      case "json":
        return response.json() as Promise<T>;
    }
  }

  async requestWithRetry<T>(
    endpoint: string,
    body: Record<string, unknown>,
    format: "json",
    timeoutMs?: number
  ): Promise<T>;
  async requestWithRetry(
    endpoint: string,
    body: Record<string, unknown>,
    format: "text",
    timeoutMs?: number
  ): Promise<string>;
  async requestWithRetry(
    endpoint: string,
    body: Record<string, unknown>,
    format: "void",
    timeoutMs?: number
  ): Promise<void>;
  async requestWithRetry<T>(
    endpoint: string,
    body: Record<string, unknown>,
    format: ResponseFormat,
    timeoutMs?: number
  ): Promise<T | string | void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        if (format === "json") {
          return await this.request<T>(endpoint, body, format, timeoutMs);
        }

        if (format === "text") {
          return await this.request(endpoint, body, format, timeoutMs);
        }

        return await this.request(endpoint, body, format, timeoutMs);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.name === "TimeoutError") {
          throw lastError;
        }

        const retryable = error instanceof KindroidApiError ? error.isRetryable : true;
        if (!retryable || attempt === MAX_RETRIES) {
          throw lastError;
        }

        const delayMs = BASE_DELAY_MS * 2 ** attempt * (0.5 + Math.random() * 0.5);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError ?? new Error("Kindroid request failed.");
  }
}

export const kindroidTimeouts = {
  default: DEFAULT_TIMEOUT_MS,
  sendMessage: SEND_MESSAGE_TIMEOUT_MS
} as const;
