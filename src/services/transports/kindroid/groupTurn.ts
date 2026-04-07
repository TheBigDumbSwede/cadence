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

export const MAX_AUTOMATIC_KINDROID_GROUP_TURNS = 30;

export async function resolveKindroidGroupTurn(options: {
  groupMirror: KindroidGroupMirror;
  participants: KindroidParticipant[];
  transportId: string;
}): Promise<KindroidGroupTurnResolution> {
  const { groupMirror, participants, transportId } = options;
  const groupParticipants = participants.filter((participant) =>
    groupMirror.participantIds.includes(participant.id)
  );

  if (groupParticipants.length === 0) {
    throw new Error("The active Kindroid group mirror has no valid local participants.");
  }

  if (groupMirror.manualTurnTaking) {
    return {
      type: "user",
      rawTurn: ""
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
    `Kindroid returned an unknown speaker (${rawTurn}) for mirrored group ` +
      `"${groupMirror.displayName}" (${groupMirror.groupId}). ` +
      `Local roster expects one of: ${groupParticipants
        .map((participant) => `${participant.bubbleName} [${participant.aiId}]`)
        .join(", ")}. Update the local mirror so it matches the real Kindroid group.`
  );
}
