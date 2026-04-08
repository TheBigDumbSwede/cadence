export type AppErrorCode =
  | "config.openai_api_key_missing"
  | "config.openai_transcription_missing"
  | "config.openai_responses_missing"
  | "config.openai_speech_missing"
  | "config.kindroid_api_key_missing"
  | "config.kindroid_ai_id_missing"
  | "config.kindroid_experimental_disabled"
  | "config.kindroid_experimental_missing"
  | "config.kindroid_group_missing"
  | "config.kindroid_group_participants_missing"
  | "config.elevenlabs_missing"
  | "config.memory_backend_missing"
  | "config.settings_secret_error"
  | "config.settings_store_error"
  | "network.unavailable"
  | "network.timeout"
  | "network.connection_refused"
  | "provider.openai_http_error"
  | "provider.openai_realtime_error"
  | "provider.kindroid_http_error"
  | "provider.memory_backend_error"
  | "transport.not_connected"
  | "transport.unsupported_mode"
  | "unknown";

export type AppErrorLike = {
  code: AppErrorCode;
  message: string;
  retryable: boolean;
  provider?: string;
  status?: number;
  cause?: unknown;
};

export class AppError extends Error implements AppErrorLike {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly provider?: string;
  readonly status?: number;

  constructor({ code, message, retryable, provider, status, cause }: AppErrorLike) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
    this.provider = provider;
    this.status = status;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function isAppError(error: unknown): error is AppErrorLike {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Partial<AppErrorLike>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.retryable === "boolean"
  );
}

export function toAppError(error: unknown, fallback: Omit<AppErrorLike, "cause">): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isAppError(error)) {
    return new AppError({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      provider: error.provider,
      status: error.status,
      cause: error
    });
  }

  if (error instanceof Error) {
    return new AppError({
      ...fallback,
      message: error.message || fallback.message,
      cause: error
    });
  }

  return new AppError({
    ...fallback,
    cause: error
  });
}
