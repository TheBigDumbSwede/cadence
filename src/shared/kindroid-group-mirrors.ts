export type KindroidConversationMode = "solo" | "group";

export type KindroidGroupMirror = {
  id: string;
  groupId: string;
  displayName: string;
  participantIds: string[];
  manualTurnTaking: boolean;
};
