import type { SpeechCaptionCue, SpeechCaptionMode } from "./speech-captions";

export type OpenAiSpeechControlState = {
  configured: boolean;
  apiKeyPresent: boolean;
  model: string;
  voice: string;
  instructions: string;
};

export type OpenAiSpeechBridge = {
  getState: () => Promise<OpenAiSpeechControlState>;
  synthesize: (
    text: string,
    options?: { voice?: string; instructions?: string }
  ) => Promise<{
    audio: ArrayBuffer;
    format: "mp3";
    model: string;
    voice: string;
    captions: SpeechCaptionCue[];
    captionsMode: SpeechCaptionMode;
  }>;
};
