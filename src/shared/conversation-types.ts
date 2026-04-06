export type ConversationTurn = {
  id: string;
  speaker: "user" | "assistant";
  speakerLabel?: string;
  kindroidParticipantId?: string;
  timestamp: string;
  text: string;
};

export type ConversationMetrics = {
  timeToListeningMs: number;
  timeToFirstSpeechMs: number;
  interruptRecoveryMs: number;
};
