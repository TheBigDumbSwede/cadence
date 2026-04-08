import "dotenv/config";

import { isAppError } from "../../src/shared/app-error";
import type {
  MemoryControlState,
  MemoryIngestRequest,
  MemoryIngestResult,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryScope,
  MemoryStoredItem,
  MemoryStoredSession
} from "../../src/shared/memory-control";
import { getSettingsService } from "./SettingsService";
import {
  buildHttpError,
  missingMemoryBackendError,
  normalizeNetworkError
} from "./appErrorUtils";

const DEFAULT_RECALL_RESULT: MemoryRecallResult = {
  items: [],
  contextBlock: ""
};

const DEFAULT_INGEST_RESULT: MemoryIngestResult = {
  written: 0,
  updated: 0,
  ignored: 0
};

function isNetworkUnavailableError(error: unknown): boolean {
  if (isAppError(error)) {
    return (
      error.code === "network.connection_refused" ||
      error.code === "network.timeout" ||
      error.code === "network.unavailable"
    );
  }

  if (!(error instanceof Error) || error.name !== "TypeError") {
    return false;
  }

  const cause = (error as Error & { cause?: { code?: string } }).cause;
  return (
    cause?.code === "ECONNREFUSED" ||
    cause?.code === "ECONNRESET" ||
    cause?.code === "ENOTFOUND" ||
    cause?.code === "ETIMEDOUT"
  );
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, "");
}

export class MemoryClient {
  getState(): MemoryControlState {
    return {
      available: this.isAvailable(),
      baseUrl: this.getBaseUrl()
    };
  }

  isAvailable(): boolean {
    return Boolean(this.getBaseUrl());
  }

  async recall(request: MemoryRecallRequest): Promise<MemoryRecallResult> {
    if (!this.isAvailable()) {
      return DEFAULT_RECALL_RESULT;
    }

    try {
      return await this.post<MemoryRecallResult>("/v1/memory/recall", request);
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return DEFAULT_RECALL_RESULT;
      }

      throw error;
    }
  }

  async ingest(request: MemoryIngestRequest): Promise<MemoryIngestResult> {
    if (!this.isAvailable()) {
      return DEFAULT_INGEST_RESULT;
    }

    try {
      return await this.post<MemoryIngestResult>("/v1/memory/ingest", request);
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return DEFAULT_INGEST_RESULT;
      }

      throw error;
    }
  }

  async closeSession(scope: MemoryScope): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await this.post("/v1/memory/session/close", { scope });
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return;
      }

      throw error;
    }
  }

  async list(profileId = "default"): Promise<MemoryStoredItem[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      return await this.get<MemoryStoredItem[]>(
        `/v1/memories?profileId=${encodeURIComponent(profileId)}`
      );
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return [];
      }

      throw error;
    }
  }

  async listSessions(profileId = "default"): Promise<MemoryStoredSession[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      return await this.get<MemoryStoredSession[]>(
        `/v1/memory-sessions?profileId=${encodeURIComponent(profileId)}`
      );
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return [];
      }

      throw error;
    }
  }

  async deleteMany(ids: string[], profileId = "default"): Promise<{ deleted: number }> {
    if (!this.isAvailable()) {
      return { deleted: 0 };
    }

    try {
      return await this.post<{ deleted: number }>("/v1/memories/delete", {
        ids,
        profileId
      });
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return { deleted: 0 };
      }

      throw error;
    }
  }

  async deleteAll(profileId = "default"): Promise<{ deleted: number }> {
    if (!this.isAvailable()) {
      return { deleted: 0 };
    }

    try {
      return await this.post<{ deleted: number }>("/v1/memories/delete-all", {
        profileId
      });
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return { deleted: 0 };
      }

      throw error;
    }
  }

  async deleteSessions(
    conversationIds: string[],
    profileId = "default"
  ): Promise<{ deleted: number }> {
    if (!this.isAvailable()) {
      return { deleted: 0 };
    }

    try {
      return await this.post<{ deleted: number }>("/v1/memory-sessions/delete", {
        conversationIds,
        profileId
      });
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return { deleted: 0 };
      }

      throw error;
    }
  }

  async deleteAllSessions(profileId = "default"): Promise<{ deleted: number }> {
    if (!this.isAvailable()) {
      return { deleted: 0 };
    }

    try {
      return await this.post<{ deleted: number }>("/v1/memory-sessions/delete-all", {
        profileId
      });
    } catch (error) {
      if (isNetworkUnavailableError(error)) {
        return { deleted: 0 };
      }

      throw error;
    }
  }

  private getBaseUrl(): string | null {
    return normalizeBaseUrl(getSettingsService().getMemoryBaseUrl());
  }

  private async post<TResponse = void>(pathname: string, body: unknown): Promise<TResponse> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw missingMemoryBackendError();
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw normalizeNetworkError({
        error,
        provider: "memory",
        fallbackMessage: "Memory backend request",
        fallbackCode: "provider.memory_backend_error"
      });
    }

    if (!response.ok) {
      throw await buildHttpError({
        response,
        provider: "memory",
        code: "provider.memory_backend_error",
        fallbackMessage: "Memory backend request failed"
      });
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }

  private async get<TResponse>(pathname: string): Promise<TResponse> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw missingMemoryBackendError();
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${pathname}`, {
        method: "GET"
      });
    } catch (error) {
      throw normalizeNetworkError({
        error,
        provider: "memory",
        fallbackMessage: "Memory backend request",
        fallbackCode: "provider.memory_backend_error"
      });
    }

    if (!response.ok) {
      throw await buildHttpError({
        response,
        provider: "memory",
        code: "provider.memory_backend_error",
        fallbackMessage: "Memory backend request failed"
      });
    }

    return (await response.json()) as TResponse;
  }
}
