import "dotenv/config";

import { getSettingsService } from "../../SettingsService";
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
      throw new Error(payload.error);
    }

    if (!rawBody.trim()) {
      throw new Error("Kindroid response did not contain a reply.");
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

    if (!apiKey || !aiId) {
      throw new Error("Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID.");
    }

    return new KindroidHttpClient(apiKey, settings.getKindroidBaseUrl());
  }
}
