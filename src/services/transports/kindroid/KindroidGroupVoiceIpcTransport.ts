import { getCadenceBridge } from "../../bridge";
import type {
  LiveConversationTransport,
  TextTurnInput,
  TransportConfig,
  Unsubscribe
} from "../../contracts";
import type { KindroidParticipant } from "../../../shared/kindroid-participants";
import type { CadenceEvent } from "../../../shared/voice-events";
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

    await this.respondFromTranscript(text);
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

    await this.respondFromTranscript(transcript.text);
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

    const respondingParticipant = await this.resolveRespondingParticipant();
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
      this.emit({
        type: "session.status",
        provider: this.id,
        status: "ready"
      });
      return;
    }

    const speechText = stripKindroidNarrationForSpeech(response);
    if (!speechText) {
      this.emit({
        type: "session.status",
        provider: this.id,
        status: "ready"
      });
      return;
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
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
  }

  private async resolveRespondingParticipant(): Promise<KindroidParticipant> {
    const groupMirror = this.config?.kindroidGroupMirror;
    const participants = this.config?.kindroidParticipants ?? [];

    if (!groupMirror) {
      throw new Error("No active Kindroid group mirror is selected.");
    }

    const groupParticipants = participants.filter((participant) =>
      groupMirror.participantIds.includes(participant.id)
    );

    if (groupParticipants.length === 0) {
      throw new Error("The active Kindroid group mirror has no valid local participants.");
    }

    if (groupMirror.manualTurnTaking) {
      const manualParticipant =
        groupParticipants.find(
          (participant) =>
            participant.id === this.config?.kindroidManualSpeakerParticipantId
        ) ?? groupParticipants[0];

      return manualParticipant;
    }

    const speakerAiId = await getCadenceBridge().kindroidExperimental.groupChats.getTurn({
      group_id: groupMirror.groupId,
      allow_user: false
    });
    const respondingParticipant = groupParticipants.find(
      (participant) => participant.aiId === speakerAiId
    );

    if (!respondingParticipant) {
      throw new Error(
        `Kindroid returned a speaker (${speakerAiId}) that is not in the mirrored local roster.`
      );
    }

    return respondingParticipant;
  }

  private emit(event: CadenceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
