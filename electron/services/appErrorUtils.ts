import { AppError, type AppErrorCode } from "../../src/shared/app-error";

function extractRemoteMessage(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: {
        message?: string;
      };
      message?: string;
    };
    return parsed.error?.message?.trim() || parsed.message?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

function readNetworkCauseCode(error: Error): string | undefined {
  return (error as Error & { cause?: { code?: string } }).cause?.code;
}

export function missingOpenAiApiKeyError(provider: string): AppError {
  return new AppError({
    code: "config.openai_api_key_missing",
    message: "OPENAI_API_KEY is not configured.",
    retryable: false,
    provider
  });
}

export function missingMemoryBackendError(): AppError {
  return new AppError({
    code: "config.memory_backend_missing",
    message: "Memory backend URL is not configured.",
    retryable: false,
    provider: "memory"
  });
}

export function missingKindroidApiKeyError(provider: string): AppError {
  return new AppError({
    code: "config.kindroid_api_key_missing",
    message: "Kindroid is not configured. Add KINDROID_API_KEY.",
    retryable: false,
    provider
  });
}

export function missingKindroidAiIdError(provider: string): AppError {
  return new AppError({
    code: "config.kindroid_ai_id_missing",
    message: "Kindroid is not configured. Add KINDROID_AI_ID.",
    retryable: false,
    provider
  });
}

export function settingsStoreError(message: string, cause?: unknown): AppError {
  return new AppError({
    code: "config.settings_store_error",
    message,
    retryable: false,
    provider: "settings",
    cause
  });
}

export function settingsSecretError(message: string, cause?: unknown): AppError {
  return new AppError({
    code: "config.settings_secret_error",
    message,
    retryable: false,
    provider: "settings",
    cause
  });
}

export async function buildHttpError(options: {
  response: Response;
  provider: string;
  code: AppErrorCode;
  fallbackMessage: string;
}): Promise<AppError> {
  const { response, provider, code, fallbackMessage } = options;
  const body = await response.text();
  const detail = extractRemoteMessage(body);
  const message = detail
    ? `${fallbackMessage} (${response.status}): ${detail}`
    : `${fallbackMessage} (${response.status}).`;

  return new AppError({
    code,
    message,
    retryable: response.status === 429 || response.status >= 500,
    provider,
    status: response.status
  });
}

export function normalizeNetworkError(options: {
  error: unknown;
  provider: string;
  fallbackMessage: string;
  fallbackCode: AppErrorCode;
}): AppError {
  const { error, provider, fallbackMessage, fallbackCode } = options;
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    const causeCode = readNetworkCauseCode(error);
    if (causeCode === "ETIMEDOUT") {
      return new AppError({
        code: "network.timeout",
        message: `${fallbackMessage} timed out.`,
        retryable: true,
        provider,
        cause: error
      });
    }

    if (causeCode === "ECONNREFUSED") {
      return new AppError({
        code: "network.connection_refused",
        message: `${fallbackMessage} could not connect.`,
        retryable: true,
        provider,
        cause: error
      });
    }

    if (
      error.name === "TypeError" &&
      (causeCode === "ECONNRESET" || causeCode === "ENOTFOUND" || causeCode === "EHOSTUNREACH")
    ) {
      return new AppError({
        code: "network.unavailable",
        message: `${fallbackMessage} is unavailable.`,
        retryable: true,
        provider,
        cause: error
      });
    }

    return new AppError({
      code: fallbackCode,
      message: error.message || fallbackMessage,
      retryable: true,
      provider,
      cause: error
    });
  }

  return new AppError({
    code: fallbackCode,
    message: fallbackMessage,
    retryable: true,
    provider,
    cause: error
  });
}

export function notConnectedTransportError(provider: string): AppError {
  return new AppError({
    code: "transport.not_connected",
    message: "Realtime socket is not connected.",
    retryable: true,
    provider
  });
}
