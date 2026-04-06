export type KindroidControlState = {
  configured: boolean;
  apiKeyPresent: boolean;
  aiIdPresent: boolean;
  baseUrl: string | null;
};

export type KindroidBridge = {
  getState: () => Promise<KindroidControlState>;
  createResponse: (
    input: string
  ) => Promise<{ text: string; provider: "kindroid" }>;
  chatBreak: (greeting: string) => Promise<void>;
};
