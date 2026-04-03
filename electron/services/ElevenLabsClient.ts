import "dotenv/config";

import { getSettingsService } from "./SettingsService";

const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

export class ElevenLabsClient {
  private getVoiceId(): string | null {
    return getSettingsService().getElevenLabsVoiceId();
  }

  isConfigured(): boolean {
    return Boolean(getSettingsService().getElevenLabsApiKey() && this.getVoiceId());
  }

  getState() {
    return {
      configured: this.isConfigured(),
      apiKeyPresent: Boolean(getSettingsService().getElevenLabsApiKey()),
      voiceIdPresent: Boolean(this.getVoiceId()),
      voiceId: this.getVoiceId(),
      model: DEFAULT_MODEL
    };
  }

  async synthesize(
    text: string,
    options?: { voiceId?: string }
  ): Promise<{ audio: ArrayBuffer; format: "mp3"; model: string; voiceId: string }> {
    const apiKey = getSettingsService().getElevenLabsApiKey();
    const voiceId = options?.voiceId ?? this.getVoiceId();
    if (!apiKey || !voiceId) {
      throw new Error(
        "ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID."
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${DEFAULT_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          text,
          model_id: DEFAULT_MODEL
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`ElevenLabs synthesis failed: ${response.status} ${errorBody}`);
    }

    return {
      audio: await response.arrayBuffer(),
      format: "mp3",
      model: DEFAULT_MODEL,
      voiceId
    };
  }
}
