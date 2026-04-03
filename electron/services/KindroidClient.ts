import "dotenv/config";

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
  private readonly baseUrl =
    process.env.KINDROID_BASE_URL ?? "https://api.kindroid.ai/v1";

  isConfigured(): boolean {
    return Boolean(process.env.KINDROID_API_KEY && process.env.KINDROID_AI_ID);
  }

  getState() {
    return {
      apiKeyPresent: Boolean(process.env.KINDROID_API_KEY),
      configured: this.isConfigured(),
      aiIdPresent: Boolean(process.env.KINDROID_AI_ID),
      baseUrl: this.baseUrl
    };
  }

  async createResponse(message: string): Promise<{ provider: "kindroid"; text: string }> {
    if (!this.isConfigured()) {
      throw new Error(
        "Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID."
      );
    }

    const response = await fetch(`${this.baseUrl}/send-message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KINDROID_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ai_id: process.env.KINDROID_AI_ID,
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

    const response = await fetch(`${this.baseUrl}/chat-break`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KINDROID_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ai_id: process.env.KINDROID_AI_ID,
        greeting
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kindroid chat-break failed: ${response.status} ${errorText}`);
    }
  }
}
