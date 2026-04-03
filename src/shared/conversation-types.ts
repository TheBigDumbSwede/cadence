export type ConversationTurn = {
  id: string;
  speaker: "user" | "assistant";
  timestamp: string;
  text: string;
};

export type ConversationMetrics = {
  timeToListeningMs: number;
  timeToFirstSpeechMs: number;
  interruptRecoveryMs: number;
};
