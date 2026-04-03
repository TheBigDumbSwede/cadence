import "dotenv/config";

const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";
const SPEECH_URL = "https://api.openai.com/v1/audio/speech";

export class OpenAISpeechClient {
  private getVoice(): string {
    return process.env.OPENAI_TTS_VOICE ?? DEFAULT_VOICE;
  }

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  getState() {
    return {
      configured: this.isConfigured(),
      apiKeyPresent: this.isConfigured(),
      model: DEFAULT_MODEL,
      voice: this.getVoice()
    };
  }

  async synthesize(
    text: string,
    options?: { voice?: string }
  ): Promise<{ audio: ArrayBuffer; format: "mp3"; model: string; voice: string }> {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const voice = options?.voice || this.getVoice();
    const response = await fetch(SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        voice,
        input: text,
        format: "mp3"
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI speech failed: ${response.status} ${errorBody}`);
    }

    return {
      audio: await response.arrayBuffer(),
      format: "mp3",
      model: DEFAULT_MODEL,
      voice
    };
  }
}
