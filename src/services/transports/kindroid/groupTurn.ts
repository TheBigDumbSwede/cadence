import { getCadenceBridge } from "../../bridge";
import type { KindroidGroupMirror } from "../../../shared/kindroid-group-mirrors";
import type { KindroidParticipant } from "../../../shared/kindroid-participants";

export type KindroidGroupTurnResolution =
  | {
      type: "user";
      rawTurn: string;
    }
  | {
      type: "participant";
      participant: KindroidParticipant;
      rawTurn: string;
    };

export const MAX_AUTOMATIC_KINDROID_GROUP_TURNS = 5;

export async function resolveKindroidGroupTurn(options: {
  groupMirror: KindroidGroupMirror;
  participants: KindroidParticipant[];
  manualSpeakerParticipantId?: string | null;
  transportId: string;
}): Promise<KindroidGroupTurnResolution> {
  const { groupMirror, participants, manualSpeakerParticipantId, transportId } = options;
  const groupParticipants = participants.filter((participant) =>
    groupMirror.participantIds.includes(participant.id)
  );

  if (groupParticipants.length === 0) {
    throw new Error("The active Kindroid group mirror has no valid local participants.");
  }

  if (groupMirror.manualTurnTaking) {
    const manualParticipant =
      groupParticipants.find((participant) => participant.id === manualSpeakerParticipantId) ??
      groupParticipants[0];

    return {
      type: "participant",
      participant: manualParticipant,
      rawTurn: manualParticipant.aiId
    };
  }

  const rawTurn = (
    await getCadenceBridge().kindroidExperimental.groupChats.getTurn({
      group_id: groupMirror.groupId,
      allow_user: true
    })
  ).trim();

  const respondingParticipant = groupParticipants.find(
    (participant) => participant.aiId === rawTurn
  );
  if (respondingParticipant) {
    return {
      type: "participant",
      participant: respondingParticipant,
      rawTurn
    };
  }

  if (rawTurn === "") {
    return {
      type: "user",
      rawTurn
    };
  }

  throw new Error(
    `Kindroid returned an unknown speaker (${rawTurn}) for group ${groupMirror.groupId}. ` +
      "The local mirror is out of sync with the real Kindroid group."
  );
}
