import "dotenv/config";

import { getSettingsService } from "./SettingsService";

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

export class KindroidClient {
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
    if (!this.isConfigured()) {
      throw new Error(
        "Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID."
      );
    }
    const settings = getSettingsService();
    const apiKey = settings.getKindroidApiKey();
    const aiId = settings.getKindroidAiId();
    const baseUrl = settings.getKindroidBaseUrl();

    const response = await fetch(`${baseUrl}/send-message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ai_id: aiId,
        message
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kindroid API failed: ${response.status} ${errorText}`);
    }

    const rawBody = await response.text();
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
    if (!this.isConfigured()) {
      throw new Error(
        "Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID."
      );
    }
    const settings = getSettingsService();
    const apiKey = settings.getKindroidApiKey();
    const aiId = settings.getKindroidAiId();
    const baseUrl = settings.getKindroidBaseUrl();
    const nextGreeting = greeting.trim() || settings.getKindroidGreeting();

    const response = await fetch(`${baseUrl}/chat-break`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ai_id: aiId,
        greeting: nextGreeting
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kindroid chat-break failed: ${response.status} ${errorText}`);
    }
  }
}
