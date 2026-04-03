export type TextControlState = {
  configured: boolean;
  apiKeyPresent: boolean;
  model: string | null;
};

export type TextBridge = {
  getState: () => Promise<TextControlState>;
  createResponse: (
    input: string,
    options?: { instructions?: string; model?: string }
  ) => Promise<{ text: string; model: string }>;
};
