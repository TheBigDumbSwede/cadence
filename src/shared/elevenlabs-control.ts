import type { SpeechCaptionCue, SpeechCaptionMode } from "./speech-captions";

export type ElevenLabsControlState = {
  configured: boolean;
  apiKeyPresent: boolean;
  voiceIdPresent: boolean;
  voiceId: string | null;
  model: string;
};

export type ElevenLabsBridge = {
  getState: () => Promise<ElevenLabsControlState>;
  synthesize: (
    text: string,
    options?: { voiceId?: string }
  ) => Promise<{
    audio: ArrayBuffer;
    format: "mp3";
    model: string;
    voiceId: string;
    captions: SpeechCaptionCue[];
    captionsMode: SpeechCaptionMode;
  }>;
};
