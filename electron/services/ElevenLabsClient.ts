import "dotenv/config";

import { getSettingsService } from "./SettingsService";
import {
  buildAlignedSpeechCaptionCues,
  estimateSpeechCaptionCues,
  type SpeechCaptionCue,
  type SpeechCaptionMode
} from "../../src/shared/speech-captions";

const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

type ElevenLabsTimestampResponse = {
  audio_base64?: string;
  alignment?: {
    characters?: string[];
    character_start_times_seconds?: number[];
    character_end_times_seconds?: number[];
  };
  normalized_alignment?: {
    characters?: string[];
    character_start_times_seconds?: number[];
    character_end_times_seconds?: number[];
  };
};

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
  ): Promise<{
    audio: ArrayBuffer;
    format: "mp3";
    model: string;
    voiceId: string;
    captions: SpeechCaptionCue[];
    captionsMode: SpeechCaptionMode;
  }> {
    const apiKey = getSettingsService().getElevenLabsApiKey();
    const voiceId = options?.voiceId ?? this.getVoiceId();
    if (!apiKey || !voiceId) {
      throw new Error(
        "ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID."
      );
    }

    const requestBody = {
      text,
      model_id: DEFAULT_MODEL
    };

    const withTimestampsResponse = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}/with-timestamps?output_format=${DEFAULT_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (withTimestampsResponse.ok) {
      const payload = (await withTimestampsResponse.json()) as ElevenLabsTimestampResponse;
      const audioBase64 = payload.audio_base64;
      if (audioBase64) {
        const alignment = payload.alignment ?? payload.normalized_alignment;
        const captions =
          alignment?.character_start_times_seconds?.length &&
          alignment?.character_end_times_seconds?.length
            ? buildAlignedSpeechCaptionCues({
                text,
                characterStartTimesMs: alignment.character_start_times_seconds.map(
                  (value) => value * 1000
                ),
                characterEndTimesMs: alignment.character_end_times_seconds.map(
                  (value) => value * 1000
                )
              })
            : estimateSpeechCaptionCues(text);

        return {
          audio: Uint8Array.from(Buffer.from(audioBase64, "base64")).buffer,
          format: "mp3",
          model: DEFAULT_MODEL,
          voiceId,
          captions,
          captionsMode:
            alignment?.character_start_times_seconds?.length &&
            alignment?.character_end_times_seconds?.length
              ? "exact"
              : "estimated"
        };
      }
    }

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}?output_format=${DEFAULT_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify(requestBody)
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
      voiceId,
      captions: estimateSpeechCaptionCues(text),
      captionsMode: "estimated"
    };
  }
}
