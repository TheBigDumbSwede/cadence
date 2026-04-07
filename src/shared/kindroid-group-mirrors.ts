export type KindroidConversationMode = "solo" | "group";

export const DEFAULT_KINDROID_GROUP_AUTO_TURN_LIMIT = 30;
export const DEFAULT_KINDROID_GROUP_TURN_PAUSE_MS = 1000;

export type KindroidGroupMirror = {
  id: string;
  groupId: string;
  displayName: string;
  participantIds: string[];
  manualTurnTaking: boolean;
  autoTurnLimit: number;
  turnPauseMs: number;
};
