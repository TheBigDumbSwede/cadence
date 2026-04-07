import "dotenv/config";

import { getSettingsService } from "./SettingsService";
import {
  estimateSpeechCaptionCues,
  type SpeechCaptionCue,
  type SpeechCaptionMode
} from "../../src/shared/speech-captions";

const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";
const SPEECH_URL = "https://api.openai.com/v1/audio/speech";

export class OpenAISpeechClient {
  private getVoice(): string {
    return getSettingsService().getOpenAiTtsVoice() ?? DEFAULT_VOICE;
  }

  private getInstructions(): string {
    return getSettingsService().getOpenAiTtsInstructions();
  }

  isConfigured(): boolean {
    return Boolean(getSettingsService().getOpenAiApiKey());
  }

  getState() {
    return {
      configured: this.isConfigured(),
      apiKeyPresent: this.isConfigured(),
      model: DEFAULT_MODEL,
      voice: this.getVoice(),
      instructions: this.getInstructions()
    };
  }

  async synthesize(
    text: string,
    options?: { voice?: string; instructions?: string }
  ): Promise<{
    audio: ArrayBuffer;
    format: "mp3";
    model: string;
    voice: string;
    captions: SpeechCaptionCue[];
    captionsMode: SpeechCaptionMode;
  }> {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    const apiKey = getSettingsService().getOpenAiApiKey();

    const voice = options?.voice || this.getVoice();
    const instructions = options?.instructions ?? this.getInstructions();
    const response = await fetch(SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        voice,
        input: text,
        format: "mp3",
        ...(instructions ? { instructions } : {})
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
      voice,
      captions: estimateSpeechCaptionCues(text),
      captionsMode: "estimated"
    };
  }
}
