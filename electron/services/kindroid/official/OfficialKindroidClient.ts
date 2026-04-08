import "dotenv/config";

import { AppError } from "../../../../src/shared/app-error";
import { getSettingsService } from "../../SettingsService";
import { missingKindroidAiIdError, missingKindroidApiKeyError } from "../../appErrorUtils";
import { KindroidHttpClient, kindroidTimeouts } from "../core/KindroidHttpClient";

type KindroidResponse = {
  response?: string;
  error?: string;
};

function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export class OfficialKindroidClient {
  isConfigured(): boolean {
    const settings = getSettingsService();
    return Boolean(settings.getKindroidApiKey() && settings.getKindroidAiId());
  }

  getState() {
    const settings = getSettingsService();
    return {
      apiKeyPresent: Boolean(settings.getKindroidApiKey()),
      configured: this.isConfigured(),
      aiIdPresent: Boolean(settings.getKindroidAiId()),
      baseUrl: settings.getKindroidBaseUrl()
    };
  }

  async createResponse(message: string): Promise<{ provider: "kindroid"; text: string }> {
    const request = this.createRequestClient();
    const aiId = getSettingsService().getKindroidAiId();

    const rawBody = await request.requestWithRetry(
      "/send-message",
      {
        ai_id: aiId,
        message
      },
      "text",
      kindroidTimeouts.sendMessage
    );

    const payload = tryParseJson<KindroidResponse>(rawBody);
    if (payload?.response) {
      return {
        provider: "kindroid",
        text: payload.response
      };
    }

    if (payload?.error) {
      throw new AppError({
        code: "provider.kindroid_http_error",
        message: payload.error,
        retryable: false,
        provider: "kindroid"
      });
    }

    if (!rawBody.trim()) {
      throw new AppError({
        code: "provider.kindroid_http_error",
        message: "Kindroid response did not contain a reply.",
        retryable: true,
        provider: "kindroid"
      });
    }

    return {
      provider: "kindroid",
      text: rawBody
    };
  }

  async chatBreak(greeting: string): Promise<void> {
    const request = this.createRequestClient();
    const settings = getSettingsService();
    const aiId = settings.getKindroidAiId();
    const nextGreeting = greeting.trim() || settings.getKindroidGreeting();

    await request.requestWithRetry(
      "/chat-break",
      {
        ai_id: aiId,
        greeting: nextGreeting
      },
      "void"
    );
  }

  private createRequestClient(): KindroidHttpClient {
    const settings = getSettingsService();
    const apiKey = settings.getKindroidApiKey();
    const aiId = settings.getKindroidAiId();

    if (!apiKey) {
      throw missingKindroidApiKeyError("kindroid");
    }

    if (!aiId) {
      throw missingKindroidAiIdError("kindroid");
    }

    return new KindroidHttpClient(apiKey, settings.getKindroidBaseUrl());
  }
}
