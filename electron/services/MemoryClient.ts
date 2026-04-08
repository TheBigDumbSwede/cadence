import "dotenv/config";

import type {
  MemoryControlState,
  MemoryIngestRequest,
  MemoryIngestResult,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryScope
} from "../../src/shared/memory-control";
import { getSettingsService } from "./SettingsService";

const DEFAULT_RECALL_RESULT: MemoryRecallResult = {
  items: [],
  contextBlock: ""
};

const DEFAULT_INGEST_RESULT: MemoryIngestResult = {
  written: 0,
  updated: 0,
  ignored: 0
};

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

    return this.post<MemoryRecallResult>("/v1/memory/recall", request);
  }

  async ingest(request: MemoryIngestRequest): Promise<MemoryIngestResult> {
    if (!this.isAvailable()) {
      return DEFAULT_INGEST_RESULT;
    }

    return this.post<MemoryIngestResult>("/v1/memory/ingest", request);
  }

  async closeSession(scope: MemoryScope): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    await this.post("/v1/memory/session/close", { scope });
  }

  private getBaseUrl(): string | null {
    return normalizeBaseUrl(getSettingsService().getMemoryBaseUrl());
  }

  private async post<TResponse = void>(
    pathname: string,
    body: unknown
  ): Promise<TResponse> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error("CADENCE_MEMORY_BASE_URL is not configured.");
    }

    const response = await fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Memory backend failed: ${response.status} ${errorBody}`);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }
}
