import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CadenceEvent } from "../../../shared/voice-events";
import type { TransportConfig } from "../../contracts";
import { KindroidGroupIpcTransport } from "./KindroidGroupIpcTransport";

const { bridgeState } = vi.hoisted(() => ({
  bridgeState: {
    getState: vi.fn(),
    sendMessage: vi.fn(),
    aiResponse: vi.fn(),
    getTurn: vi.fn()
  }
}));

vi.mock("../../bridge", () => ({
  getCadenceBridge: () => ({
    kindroidExperimental: {
      getState: bridgeState.getState,
      groupChats: {
        sendMessage: bridgeState.sendMessage,
        aiResponse: bridgeState.aiResponse,
        getTurn: bridgeState.getTurn
      }
    }
  })
}));

function createConfig(overrides?: Partial<TransportConfig>): TransportConfig {
  return {
    model: "kindroid+text-only",
    voice: "",
    instructions: "",
    modalities: ["text"],
    kindroidConversationMode: "group",
    kindroidParticipants: [
      {
        id: "participant-1",
        aiId: "ai-1",
        displayName: "Amanda",
        bubbleName: "Amanda",
        waveformColor: "#d7955b",
        waveformAccent: "halo",
        ttsProvider: "none",
        filterNarrationForTts: true,
        narrationDelimiter: "*",
        openAiVoice: "",
        openAiInstructions: "",
        elevenLabsVoiceId: ""
      }
    ],
    kindroidGroupMirror: {
      id: "group-1",
      groupId: "kindroid-group-1",
      displayName: "Test Group",
      participantIds: ["participant-1"],
      manualTurnTaking: true,
      autoTurnLimit: 30,
      turnPauseMs: 0
    },
    ...overrides
  };
}

describe("KindroidGroupIpcTransport", () => {
  beforeEach(() => {
    bridgeState.getState.mockReset();
    bridgeState.sendMessage.mockReset();
    bridgeState.aiResponse.mockReset();
    bridgeState.getTurn.mockReset();
    bridgeState.getState.mockResolvedValue({
      enabled: true,
      configured: true
    });
  });

  it("waits for an explicit roster click after sending a user message in manual mode", async () => {
    const transport = new KindroidGroupIpcTransport();
    const events: CadenceEvent[] = [];
    transport.subscribe((event) => {
      events.push(event);
    });

    await transport.connect(createConfig());
    events.length = 0;

    await transport.sendUserText("Hello there");

    expect(bridgeState.sendMessage).toHaveBeenCalledWith({
      group_id: "kindroid-group-1",
      message: "Hello there"
    });
    expect(bridgeState.aiResponse).not.toHaveBeenCalled();
    expect(bridgeState.getTurn).not.toHaveBeenCalled();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "conversation.turn.pending",
          turnOwner: "user",
          message: "Choose who replies next."
        })
      ])
    );
  });

  it("recovers to a usable pending state when a forced manual turn fails", async () => {
    const transport = new KindroidGroupIpcTransport();
    const events: CadenceEvent[] = [];
    transport.subscribe((event) => {
      events.push(event);
    });

    bridgeState.aiResponse.mockRejectedValue(new Error("Kindroid exploded."));

    await transport.connect(createConfig());
    events.length = 0;

    await transport.requestKindroidGroupParticipantTurn("participant-1");

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "transport.error",
          recoverable: true,
          message: "Kindroid exploded."
        }),
        expect.objectContaining({
          type: "conversation.turn.pending",
          turnOwner: "user",
          message: "Choose who replies next."
        })
      ])
    );
  });

  it("returns the floor to the user when automatic chaining is interrupted", async () => {
    const transport = new KindroidGroupIpcTransport();
    const events: CadenceEvent[] = [];
    transport.subscribe((event) => {
      events.push(event);
    });

    let resolveFirstResponse!: (value: string) => void;
    const firstResponse = new Promise<string>((resolve) => {
      resolveFirstResponse = resolve;
    });
    bridgeState.getTurn.mockResolvedValue("ai-1");
    bridgeState.aiResponse.mockImplementation(() => firstResponse);

    await transport.connect(
      createConfig({
        kindroidGroupMirror: {
          id: "group-1",
          groupId: "kindroid-group-1",
          displayName: "Test Group",
          participantIds: ["participant-1"],
          manualTurnTaking: false,
          autoTurnLimit: 30,
          turnPauseMs: 0
        }
      })
    );
    events.length = 0;

    const sendPromise = transport.sendUserText("Keep going");
    await Promise.resolve();
    await transport.interruptAssistant("operator_stop");
    resolveFirstResponse("This should not land");
    await sendPromise;

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant.interrupted",
          reason: "operator_stop"
        }),
        expect.objectContaining({
          type: "conversation.turn.pending",
          turnOwner: "user",
          message: "Your turn."
        })
      ])
    );
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant.response.completed",
          text: "This should not land"
        })
      ])
    );
  });
});
