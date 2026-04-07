import { getCadenceBridge } from "../../bridge";
import type {
  LiveConversationTransport,
  TextTurnInput,
  TransportConfig,
  Unsubscribe
} from "../../contracts";
import type { KindroidParticipant } from "../../../shared/kindroid-participants";
import type { CadenceEvent } from "../../../shared/voice-events";
import {
  MAX_AUTOMATIC_KINDROID_GROUP_TURNS,
  resolveKindroidGroupTurn
} from "./groupTurn";
import { stripKindroidNarrationForSpeech } from "./speechText";

export class KindroidGroupVoiceIpcTransport implements LiveConversationTransport {
  readonly id = "kindroid-group-voice";
  readonly label = "Kindroid Group Voice";

  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private config: TransportConfig | null = null;

  async connect(config: TransportConfig): Promise<void> {
    this.config = config;
    const bridge = getCadenceBridge();
    const [openAiState, experimentalState, elevenLabsState, openAiSpeechState] =
      await Promise.all([
        bridge.openaiAudio.getState(),
        bridge.kindroidExperimental.getState(),
        bridge.elevenlabs.getState(),
        bridge.openaiSpeech.getState()
      ]);

    if (!openAiState.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "OpenAI transcription is not configured.",
        recoverable: false
      });
      throw new Error("OpenAI transcription is not configured.");
    }

    if (!experimentalState.enabled) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "Kindroid experimental endpoints are disabled.",
        recoverable: false
      });
      throw new Error("Kindroid experimental endpoints are disabled.");
    }

    if (!experimentalState.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "Kindroid experimental group chat is not configured.",
        recoverable: false
      });
      throw new Error("Kindroid experimental group chat is not configured.");
    }

    if (!this.config?.kindroidGroupMirror?.groupId) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "No active Kindroid group mirror is selected.",
        recoverable: false
      });
      throw new Error("No active Kindroid group mirror is selected.");
    }

    const groupParticipants = (this.config?.kindroidParticipants ?? []).filter((participant) =>
      this.config?.kindroidGroupMirror?.participantIds.includes(participant.id)
    );
    if (groupParticipants.length === 0) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "The active Kindroid group mirror has no valid local participants.",
        recoverable: false
      });
      throw new Error("The active Kindroid group mirror has no valid local participants.");
    }
    const usesOpenAiSpeech = groupParticipants.some(
      (participant) => participant.ttsProvider === "openai"
    );
    const usesElevenLabs = groupParticipants.some(
      (participant) => participant.ttsProvider === "elevenlabs"
    );
    const usesTextOnly = groupParticipants.every(
      (participant) => participant.ttsProvider === "none"
    );

    if (!usesTextOnly && usesElevenLabs && !elevenLabsState.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message:
          "ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.",
        recoverable: false
      });
      throw new Error(
        "ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID."
      );
    }

    if (!usesTextOnly && usesOpenAiSpeech && !openAiSpeechState.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "OpenAI speech is not configured.",
        recoverable: false
      });
      throw new Error("OpenAI speech is not configured.");
    }

    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
  }

  async disconnect(): Promise<void> {
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "disconnected"
    });
  }

  async sendUserText(text: string, _turns?: TextTurnInput[]): Promise<void> {
    if (!text.trim()) {
      return;
    }

    const userTurnId = crypto.randomUUID();
    this.emit({
      type: "transcript.final",
      turnId: userTurnId,
      text
    });

    try {
      await this.respondFromTranscript(text);
    } catch (error) {
      this.handleRecoverableError(error, "Your turn.");
    }
  }

  async sendUserAudio(audio: ArrayBuffer): Promise<void> {
    const bridge = getCadenceBridge();
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "thinking"
    });

    const transcript = await bridge.openaiAudio.transcribe(audio);
    const userTurnId = crypto.randomUUID();
    this.emit({
      type: "transcript.final",
      turnId: userTurnId,
      text: transcript.text
    });

    try {
      await this.respondFromTranscript(transcript.text);
    } catch (error) {
      this.handleRecoverableError(error, "Your turn.");
    }
  }

  async requestKindroidGroupParticipantTurn(kindroidParticipantId: string): Promise<void> {
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "thinking"
    });
    try {
      await this.runGroupTurnCycle({ forcedParticipantId: kindroidParticipantId });
    } catch (error) {
      this.handleRecoverableError(
        error,
        this.config?.kindroidGroupMirror?.manualTurnTaking
          ? "Choose who replies next."
          : "Your turn."
      );
    }
  }

  async interruptAssistant(
    reason: "user_barge_in" | "operator_stop" = "operator_stop"
  ): Promise<void> {
    this.emit({
      type: "assistant.interrupted",
      reason
    });
  }

  subscribe(listener: (event: CadenceEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async respondFromTranscript(transcript: string): Promise<void> {
    if (!transcript.trim()) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "Transcription was empty.",
        recoverable: true
      });
      return;
    }

    const groupMirror = this.config?.kindroidGroupMirror;
    if (!groupMirror?.groupId) {
      throw new Error("No active Kindroid group mirror is selected.");
    }

    const bridge = getCadenceBridge();
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "thinking"
    });

    await bridge.kindroidExperimental.groupChats.sendMessage({
      group_id: groupMirror.groupId,
      message: transcript
    });

    if (groupMirror.manualTurnTaking) {
      this.emit({
        type: "session.status",
        provider: this.id,
        status: "ready"
      });
      this.emit({
        type: "conversation.turn.pending",
        provider: this.id,
        turnOwner: "user",
        message: "Choose who replies next."
      });
      return;
    }

    await this.runGroupTurnCycle();
  }

  private async runGroupTurnCycle(options?: {
    forcedParticipantId?: string;
  }): Promise<void> {
    const groupMirror = this.config?.kindroidGroupMirror;
    if (!groupMirror?.groupId) {
      throw new Error("No active Kindroid group mirror is selected.");
    }

    const bridge = getCadenceBridge();
    const maxTurns = groupMirror.manualTurnTaking ? 1 : MAX_AUTOMATIC_KINDROID_GROUP_TURNS;

    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
      const forcedParticipant =
        turnIndex === 0 && options?.forcedParticipantId
          ? this.resolveParticipantById(options.forcedParticipantId)
          : null;
      const turnResolution = forcedParticipant
        ? { type: "participant" as const, participant: forcedParticipant }
        : await this.resolveTurn();

      if (turnResolution.type === "user") {
        this.emit({
          type: "session.status",
          provider: this.id,
          status: "ready"
        });
        this.emit({
          type: "conversation.turn.pending",
          provider: this.id,
          turnOwner: "user",
          message: "Your turn."
        });
        return;
      }

      const respondingParticipant = turnResolution.participant;
      this.emit({
        type: "session.status",
        provider: this.id,
        status: "thinking"
      });
      this.emit({
        type: "conversation.turn.pending",
        provider: this.id,
        turnOwner: "assistant",
        speakerLabel: respondingParticipant.bubbleName,
        kindroidParticipantId: respondingParticipant.id,
        message: `${respondingParticipant.bubbleName} is thinking...`
      });
      const response = await bridge.kindroidExperimental.groupChats.aiResponse({
        ai_id: respondingParticipant.aiId,
        group_id: groupMirror.groupId
      });
      const assistantTurnId = crypto.randomUUID();

      this.emit({
        type: "assistant.response.delta",
        turnId: assistantTurnId,
        text: response,
        speakerLabel: respondingParticipant.bubbleName,
        kindroidParticipantId: respondingParticipant.id
      });
      this.emit({
        type: "assistant.response.completed",
        turnId: assistantTurnId,
        text: response,
        speakerLabel: respondingParticipant.bubbleName,
        kindroidParticipantId: respondingParticipant.id
      });

      if (
        this.config?.model.includes("text-only") ||
        respondingParticipant.ttsProvider === "none"
      ) {
        continue;
      }

      const speechText = stripKindroidNarrationForSpeech(response, {
        enabled: respondingParticipant.filterNarrationForTts,
        delimiter: respondingParticipant.narrationDelimiter
      });
      if (!speechText) {
        continue;
      }

      this.emit({
        type: "session.status",
        provider: this.id,
        status: "speaking"
      });

      const synthesis = respondingParticipant.ttsProvider === "openai"
        ? await bridge.openaiSpeech.synthesize(speechText, {
            voice: respondingParticipant.openAiVoice || undefined,
            instructions: respondingParticipant.openAiInstructions || undefined
          })
        : await bridge.elevenlabs.synthesize(speechText, {
            voiceId: respondingParticipant.elevenLabsVoiceId || undefined
          });

      this.emit({
        type: "assistant.audio.chunk",
        turnId: assistantTurnId,
        sequence: 0,
        format: synthesis.format,
        data: synthesis.audio
      });
    }

    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
    this.emit({
      type: "conversation.turn.pending",
      provider: this.id,
      turnOwner: "user",
      message: groupMirror.manualTurnTaking
        ? "Choose who replies next."
        : `Paused after ${MAX_AUTOMATIC_KINDROID_GROUP_TURNS} turns. Your turn.`
    });
  }

  private async resolveTurn() {
    const groupMirror = this.config?.kindroidGroupMirror;
    const participants = this.config?.kindroidParticipants ?? [];

    if (!groupMirror) {
      throw new Error("No active Kindroid group mirror is selected.");
    }

    return resolveKindroidGroupTurn({
      groupMirror,
      participants,
      transportId: this.id
    });
  }

  private handleRecoverableError(error: unknown, fallbackMessage: string): void {
    this.emit({
      type: "transport.error",
      provider: this.id,
      message: error instanceof Error ? error.message : "Kindroid group turn failed.",
      recoverable: true
    });
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
    this.emit({
      type: "conversation.turn.pending",
      provider: this.id,
      turnOwner: "user",
      message: fallbackMessage
    });
  }

  private resolveParticipantById(kindroidParticipantId: string): KindroidParticipant {
    const groupMirror = this.config?.kindroidGroupMirror;
    const participants = this.config?.kindroidParticipants ?? [];

    if (!groupMirror) {
      throw new Error("No active Kindroid group mirror is selected.");
    }

    const participant = participants.find(
      (candidate) =>
        candidate.id === kindroidParticipantId &&
        groupMirror.participantIds.includes(candidate.id)
    );

    if (!participant) {
      throw new Error("The selected Kindroid participant is not part of the active group.");
    }

    return participant;
  }

  private emit(event: CadenceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
