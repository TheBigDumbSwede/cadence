import type { ConversationTurn } from "../../shared/conversation-types";
import { timestampNow } from "./timing";

export function appendOrUpdateAssistantTurn(
  turns: ConversationTurn[],
  turnId: string,
  text: string,
  mode: "append" | "replace",
  options?: {
    speakerLabel?: string;
    kindroidParticipantId?: string;
  }
): ConversationTurn[] {
  const existingIndex = turns.findIndex((turn) => turn.id === turnId);
  if (existingIndex >= 0) {
    const updated = [...turns];
    updated[existingIndex] = {
      ...updated[existingIndex],
      speakerLabel: options?.speakerLabel ?? updated[existingIndex].speakerLabel,
      kindroidParticipantId:
        options?.kindroidParticipantId ?? updated[existingIndex].kindroidParticipantId,
      text:
        mode === "replace"
          ? text || updated[existingIndex].text
          : updated[existingIndex].text + text
    };
    return updated;
  }

  return [
    ...turns,
    {
      id: turnId,
      speaker: "assistant",
      speakerLabel: options?.speakerLabel,
      kindroidParticipantId: options?.kindroidParticipantId,
      timestamp: timestampNow(),
      text
    }
  ];
}

export function isBenignInterruptError(message: string, recoverable: boolean): boolean {
  if (!recoverable) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("cancel") ||
    normalized.includes("no active response") ||
    normalized.includes("response not found")
  );
}
