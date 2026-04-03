export type OpenAiAudioControlState = {
  configured: boolean;
  apiKeyPresent: boolean;
  model: string;
};

export type OpenAiAudioBridge = {
  getState: () => Promise<OpenAiAudioControlState>;
  transcribe: (audio: ArrayBuffer) => Promise<{ text: string; model: string }>;
};
