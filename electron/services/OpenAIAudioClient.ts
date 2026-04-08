import "dotenv/config";

import { getSettingsService } from "./SettingsService";
import {
  buildHttpError,
  missingOpenAiApiKeyError,
  normalizeNetworkError
} from "./appErrorUtils";

const DEFAULT_MODEL = "gpt-4o-transcribe";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_PROMPT =
  "Transcribe spoken conversational English verbatim. Do not translate, transliterate, or rewrite into any other language or script. Use normal English words and punctuation.";
const TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

function pcm16ToWav(pcm: ArrayBuffer, sampleRate: number): ArrayBuffer {
  const dataLength = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm));

  return buffer;
}

export class OpenAIAudioClient {
  isConfigured(): boolean {
    return Boolean(getSettingsService().getOpenAiApiKey());
  }

  getState() {
    return {
      configured: this.isConfigured(),
      apiKeyPresent: this.isConfigured(),
      model: DEFAULT_MODEL,
      language: DEFAULT_LANGUAGE
    };
  }

  async transcribe(audio: ArrayBuffer): Promise<{ text: string; model: string }> {
    if (!this.isConfigured()) {
      throw missingOpenAiApiKeyError("openai-audio");
    }
    const apiKey = getSettingsService().getOpenAiApiKey();

    const form = new FormData();
    const wav = pcm16ToWav(audio, 24000);
    form.append("model", DEFAULT_MODEL);
    form.append("language", DEFAULT_LANGUAGE);
    form.append("prompt", DEFAULT_PROMPT);
    form.append("response_format", "text");
    form.append("temperature", "0");
    form.append("file", new Blob([wav], { type: "audio/wav" }), "cadence.wav");

    let response: Response;
    try {
      response = await fetch(TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: form
      });
    } catch (error) {
      throw normalizeNetworkError({
        error,
        provider: "openai-audio",
        fallbackMessage: "OpenAI transcription request",
        fallbackCode: "provider.openai_http_error"
      });
    }

    if (!response.ok) {
      throw await buildHttpError({
        response,
        provider: "openai-audio",
        code: "provider.openai_http_error",
        fallbackMessage: "OpenAI transcription request failed"
      });
    }

    const transcript = await response.text();
    return {
      text: transcript,
      model: DEFAULT_MODEL
    };
  }
}
