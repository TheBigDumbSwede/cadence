import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KindroidGroupMirror } from "../../../shared/kindroid-group-mirrors";
import type { KindroidParticipant } from "../../../shared/kindroid-participants";
import { resolveKindroidGroupTurn } from "./groupTurn";

const { getTurnMock } = vi.hoisted(() => ({
  getTurnMock: vi.fn()
}));

vi.mock("../../bridge", () => ({
  getCadenceBridge: () => ({
    kindroidExperimental: {
      groupChats: {
        getTurn: getTurnMock
      }
    }
  })
}));

const participants: KindroidParticipant[] = [
  {
    id: "participant-1",
    aiId: "ai-1",
    displayName: "Amanda",
    bubbleName: "Amanda",
    waveformColor: "#d7955b",
    waveformAccent: "halo",
    ttsProvider: "openai",
    filterNarrationForTts: true,
    narrationDelimiter: "*",
    openAiVoice: "nova",
    openAiInstructions: "",
    elevenLabsVoiceId: ""
  },
  {
    id: "participant-2",
    aiId: "ai-2",
    displayName: "Snikkle",
    bubbleName: "Snikkle",
    waveformColor: "#7bb9df",
    waveformAccent: "spark",
    ttsProvider: "none",
    filterNarrationForTts: true,
    narrationDelimiter: "*",
    openAiVoice: "",
    openAiInstructions: "",
    elevenLabsVoiceId: ""
  }
];

function createGroupMirror(overrides?: Partial<KindroidGroupMirror>): KindroidGroupMirror {
  return {
    id: "group-1",
    groupId: "kindroid-group-1",
    displayName: "Test Group",
    participantIds: participants.map((participant) => participant.id),
    manualTurnTaking: false,
    autoTurnLimit: 30,
    turnPauseMs: 0,
    ...overrides
  };
}

describe("resolveKindroidGroupTurn", () => {
  beforeEach(() => {
    getTurnMock.mockReset();
  });

  it("returns user turn immediately for manual groups without hitting Kindroid", async () => {
    const result = await resolveKindroidGroupTurn({
      groupMirror: createGroupMirror({ manualTurnTaking: true }),
      participants,
      transportId: "kindroid-group-text"
    });

    expect(result).toEqual({
      type: "user",
      rawTurn: ""
    });
    expect(getTurnMock).not.toHaveBeenCalled();
  });

  it("returns the matching participant when Kindroid selects a roster ai_id", async () => {
    getTurnMock.mockResolvedValue("ai-2");

    const result = await resolveKindroidGroupTurn({
      groupMirror: createGroupMirror(),
      participants,
      transportId: "kindroid-group-text"
    });

    expect(result).toMatchObject({
      type: "participant",
      rawTurn: "ai-2",
      participant: {
        id: "participant-2",
        bubbleName: "Snikkle"
      }
    });
    expect(getTurnMock).toHaveBeenCalledWith({
      group_id: "kindroid-group-1",
      allow_user: true
    });
  });

  it("returns the user turn when Kindroid yields an empty speaker", async () => {
    getTurnMock.mockResolvedValue("");

    const result = await resolveKindroidGroupTurn({
      groupMirror: createGroupMirror(),
      participants,
      transportId: "kindroid-group-text"
    });

    expect(result).toEqual({
      type: "user",
      rawTurn: ""
    });
  });

  it("throws when Kindroid returns a speaker outside the mirrored roster", async () => {
    getTurnMock.mockResolvedValue("unknown-ai");

    await expect(
      resolveKindroidGroupTurn({
        groupMirror: createGroupMirror(),
        participants,
        transportId: "kindroid-group-text"
      })
    ).rejects.toThrow("Update the local mirror so it matches the real Kindroid group.");
  });
});
