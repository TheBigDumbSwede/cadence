export type OpenAiSpeechControlState = {
  configured: boolean;
  apiKeyPresent: boolean;
  model: string;
  voice: string;
};

export type OpenAiSpeechBridge = {
  getState: () => Promise<OpenAiSpeechControlState>;
  synthesize: (
    text: string,
    options?: { voice?: string }
  ) => Promise<{ audio: ArrayBuffer; format: "mp3"; model: string; voice: string }>;
};
