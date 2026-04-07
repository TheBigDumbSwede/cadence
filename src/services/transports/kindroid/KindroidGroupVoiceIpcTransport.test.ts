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
    synthesize: vi.fn(),
    synthesizeSoundEffect: vi.fn()
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
      getState: bridgeState.elevenLabsGetState,
      synthesizeSoundEffect: bridgeState.synthesizeSoundEffect
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
        narrationFxEnabled: false,
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
        narrationFxEnabled: false,
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
    bridgeState.synthesizeSoundEffect.mockReset();

    bridgeState.openAiAudioGetState.mockResolvedValue({ configured: true });
    bridgeState.kindroidExperimentalGetState.mockResolvedValue({
      enabled: true,
      configured: true
    });
    bridgeState.elevenLabsGetState.mockResolvedValue({ configured: true, apiKeyPresent: true });
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
        audio: new Uint8Array([1, 2, 3]).buffer,
        captions: [],
        captionsMode: "estimated"
      })
      .mockResolvedValueOnce({
        format: "mp3",
        audio: new Uint8Array([4, 5, 6]).buffer,
        captions: [],
        captionsMode: "estimated"
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

  it("emits one low-volume narration effect for audible narration without blocking speech", async () => {
    const transport = new KindroidGroupVoiceIpcTransport();
    const events: CadenceEvent[] = [];
    transport.subscribe((event) => {
      events.push(event);
    });

    const config = createConfig();
    if (!config.kindroidParticipants) {
      throw new Error("Missing Kindroid participants in test config.");
    }
    config.kindroidParticipants[0].narrationFxEnabled = true;

    bridgeState.getTurn.mockResolvedValueOnce("ai-1").mockResolvedValueOnce("");
    bridgeState.aiResponse.mockResolvedValueOnce(
      "*She drops the small charm into a glass bowl with a bright clink.* Hello there."
    );
    bridgeState.synthesize.mockResolvedValueOnce({
      format: "mp3",
      audio: new Uint8Array([1, 2, 3]).buffer,
      captions: [],
      captionsMode: "estimated"
    });
    bridgeState.synthesizeSoundEffect.mockResolvedValueOnce({
      format: "mp3",
      audio: new Uint8Array([9, 9, 9]).buffer,
      model: "eleven_sound_effects"
    });

    await transport.connect(config);
    events.length = 0;

    await transport.sendUserText("Set the scene");
    await Promise.resolve();

    expect(bridgeState.synthesize).toHaveBeenCalledTimes(1);
    expect(bridgeState.synthesizeSoundEffect).toHaveBeenCalledTimes(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant.audio.chunk",
          format: "mp3"
        }),
        expect.objectContaining({
          type: "assistant.audio.effect",
          format: "mp3",
          gain: expect.any(Number)
        })
      ])
    );
  });

  it("can trigger a narration effect from user input in Kindroid group voice mode", async () => {
    const transport = new KindroidGroupVoiceIpcTransport();
    const events: CadenceEvent[] = [];
    transport.subscribe((event) => {
      events.push(event);
    });

    const config = createConfig();
    if (!config.kindroidParticipants) {
      throw new Error("Missing Kindroid participants in test config.");
    }
    config.kindroidParticipants[0].narrationFxEnabled = true;

    bridgeState.getTurn.mockResolvedValueOnce("");
    bridgeState.synthesizeSoundEffect.mockResolvedValueOnce({
      format: "mp3",
      audio: new Uint8Array([7, 7, 7]).buffer,
      model: "eleven_text_to_sound_v2"
    });

    await transport.connect(config);
    events.length = 0;

    await transport.sendUserText(
      '*The engine rumbles to life as I slam the car door shut.* "We should go."'
    );
    await Promise.resolve();

    expect(bridgeState.synthesizeSoundEffect).toHaveBeenCalledTimes(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant.audio.effect",
          format: "mp3",
          offsetMs: 0
        })
      ])
    );
  });
});
