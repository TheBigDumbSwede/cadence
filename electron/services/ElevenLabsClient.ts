import "dotenv/config";

const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

export class ElevenLabsClient {
  private getVoiceId(): string | null {
    return process.env.ELEVENLABS_VOICE_ID ?? process.env.CADENCE_VOICE_ID ?? null;
  }

  isConfigured(): boolean {
    return Boolean(process.env.ELEVENLABS_API_KEY && this.getVoiceId());
  }

  getState() {
    return {
      configured: this.isConfigured(),
      apiKeyPresent: Boolean(process.env.ELEVENLABS_API_KEY),
      voiceIdPresent: Boolean(this.getVoiceId()),
      voiceId: this.getVoiceId(),
      model: DEFAULT_MODEL
    };
  }

  async synthesize(
    text: string,
    options?: { voiceId?: string }
  ): Promise<{ audio: ArrayBuffer; format: "mp3"; model: string; voiceId: string }> {
    const voiceId = options?.voiceId ?? this.getVoiceId();
    if (!process.env.ELEVENLABS_API_KEY || !voiceId) {
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
          "xi-api-key": process.env.ELEVENLABS_API_KEY
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
