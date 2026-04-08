export type MemoryBackend =
  | "openai-realtime"
  | "openai-responses"
  | "openai-batch";

export type MemoryTurn = {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: string;
  speakerLabel?: string;
};

export type MemoryScope = {
  profileId: string;
  conversationId: string;
  backend: MemoryBackend;
  participantIds?: string[];
};

export type MemoryRecallRequest = {
  scope: MemoryScope;
  recentTurns: MemoryTurn[];
  maxItems?: number;
  maxTokens?: number;
};

export type MemoryItem = {
  id: string;
  type: "preference" | "fact" | "relationship" | "session";
  text: string;
  score?: number;
  lastUpdatedAt?: string;
};

export type MemoryRecallResult = {
  items: MemoryItem[];
  contextBlock: string;
};

export type MemoryIngestRequest = {
  scope: MemoryScope;
  turns: MemoryTurn[];
  reason: "turn" | "checkpoint" | "session_close";
};

export type MemoryIngestResult = {
  written: number;
  updated: number;
  ignored: number;
};

export type MemoryControlState = {
  available: boolean;
  baseUrl: string | null;
};

export type MemoryBridge = {
  getState: () => Promise<MemoryControlState>;
  recall: (request: MemoryRecallRequest) => Promise<MemoryRecallResult>;
  ingest: (request: MemoryIngestRequest) => Promise<MemoryIngestResult>;
  closeSession: (scope: MemoryScope) => Promise<void>;
};
