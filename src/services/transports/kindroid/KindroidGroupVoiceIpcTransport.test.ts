import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CadenceEvent } from "../../../shared/voice-events";
import type { TransportConfig } from "../../contracts";
import { KindroidGroupVoiceIpcTransport } from "./KindroidGroupVoiceIpcTransport";

const { bridgeState } = vi.hoisted(() => ({
  bridgeState: {
    openAiAudioGetState: vi.fn(),
    kindroidExperimentalGetState: vi.fn(),
    elevenLabsGetState: vi.fn(),
    openAiSpeechGetState: vi.fn(),
    sendMessage: vi.fn(),
    aiResponse: vi.fn(),
    getTurn: vi.fn(),
    synthesize: vi.fn()
  }
}));

vi.mock("../../bridge", () => ({
  getCadenceBridge: () => ({
    openaiAudio: {
      getState: bridgeState.openAiAudioGetState
    },
    kindroidExperimental: {
      getState: bridgeState.kindroidExperimentalGetState,
      groupChats: {
        sendMessage: bridgeState.sendMessage,
        aiResponse: bridgeState.aiResponse,
        getTurn: bridgeState.getTurn
      }
    },
    elevenlabs: {
      getState: bridgeState.elevenLabsGetState
    },
    openaiSpeech: {
      getState: bridgeState.openAiSpeechGetState,
      synthesize: bridgeState.synthesize
    }
  })
}));

function createConfig(): TransportConfig {
  return {
    model: "kindroid+openai-tts",
    voice: "",
    instructions: "",
    modalities: ["text", "audio"],
    kindroidConversationMode: "group",
    kindroidParticipants: [
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
        openAiInstructions: "Measured and dry.",
        elevenLabsVoiceId: ""
      },
      {
        id: "participant-2",
        aiId: "ai-2",
        displayName: "Snikkle",
        bubbleName: "Snikkle",
        waveformColor: "#7bb9df",
        waveformAccent: "spark",
        ttsProvider: "openai",
        filterNarrationForTts: true,
        narrationDelimiter: "*",
        openAiVoice: "marin",
        openAiInstructions: "Small and sly.",
        elevenLabsVoiceId: ""
      }
    ],
    kindroidGroupMirror: {
      id: "group-1",
      groupId: "kindroid-group-1",
      displayName: "Test Group",
      participantIds: ["participant-1", "participant-2"],
      manualTurnTaking: false,
      autoTurnLimit: 30,
      turnPauseMs: 0
    }
  };
}

describe("KindroidGroupVoiceIpcTransport", () => {
  beforeEach(() => {
    bridgeState.openAiAudioGetState.mockReset();
    bridgeState.kindroidExperimentalGetState.mockReset();
    bridgeState.elevenLabsGetState.mockReset();
    bridgeState.openAiSpeechGetState.mockReset();
    bridgeState.sendMessage.mockReset();
    bridgeState.aiResponse.mockReset();
    bridgeState.getTurn.mockReset();
    bridgeState.synthesize.mockReset();

    bridgeState.openAiAudioGetState.mockResolvedValue({ configured: true });
    bridgeState.kindroidExperimentalGetState.mockResolvedValue({
      enabled: true,
      configured: true
    });
    bridgeState.elevenLabsGetState.mockResolvedValue({ configured: true });
    bridgeState.openAiSpeechGetState.mockResolvedValue({ configured: true });
  });

  it("chains automatic group replies through the voice path until Kindroid returns the user turn", async () => {
    const transport = new KindroidGroupVoiceIpcTransport();
    const events: CadenceEvent[] = [];
    transport.subscribe((event) => {
      events.push(event);
    });

    bridgeState.getTurn
      .mockResolvedValueOnce("ai-1")
      .mockResolvedValueOnce("ai-2")
      .mockResolvedValueOnce("");
    bridgeState.aiResponse
      .mockResolvedValueOnce("First reply")
      .mockResolvedValueOnce("Second reply");
    bridgeState.synthesize
      .mockResolvedValueOnce({
        format: "mp3",
        audio: new Uint8Array([1, 2, 3]).buffer
      })
      .mockResolvedValueOnce({
        format: "mp3",
        audio: new Uint8Array([4, 5, 6]).buffer
      });

    await transport.connect(createConfig());
    events.length = 0;

    await transport.sendUserText("Set the scene");

    expect(bridgeState.sendMessage).toHaveBeenCalledWith({
      group_id: "kindroid-group-1",
      message: "Set the scene"
    });
    expect(bridgeState.getTurn).toHaveBeenCalledTimes(3);
    expect(bridgeState.aiResponse).toHaveBeenCalledTimes(2);
    expect(bridgeState.synthesize).toHaveBeenCalledTimes(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "conversation.turn.pending",
          turnOwner: "assistant",
          speakerLabel: "Amanda",
          message: "Amanda is thinking..."
        }),
        expect.objectContaining({
          type: "assistant.response.completed",
          text: "First reply",
          speakerLabel: "Amanda"
        }),
        expect.objectContaining({
          type: "assistant.audio.chunk",
          format: "mp3"
        }),
        expect.objectContaining({
          type: "conversation.turn.pending",
          turnOwner: "assistant",
          speakerLabel: "Snikkle",
          message: "Snikkle is thinking..."
        }),
        expect.objectContaining({
          type: "assistant.response.completed",
          text: "Second reply",
          speakerLabel: "Snikkle"
        }),
        expect.objectContaining({
          type: "conversation.turn.pending",
          turnOwner: "user",
          message: "Your turn."
        })
      ])
    );
  });
});
