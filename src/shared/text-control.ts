export type TextControlState = {
  configured: boolean;
  apiKeyPresent: boolean;
  model: string | null;
};

export type TextResponseOptions = {
  instructions?: string;
  model?: string;
  memoryContext?: string;
};

export type TextBridge = {
  getState: () => Promise<TextControlState>;
  createResponse: (
    input: string,
    options?: TextResponseOptions
  ) => Promise<{ text: string; model: string }>;
};
