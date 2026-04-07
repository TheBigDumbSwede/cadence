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
import {
  computeNarrationEffectOffsetMs,
  describeKindroidNarrationEffects,
  extractDelimitedNarrationSegments,
  selectKindroidNarrationEffect
} from "./narrationEffects";
import { stripKindroidNarrationForSpeech } from "./speechText";

export class KindroidGroupVoiceIpcTransport implements LiveConversationTransport {
  readonly id = "kindroid-group-voice";
  readonly label = "Kindroid Group Voice";

  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private config: TransportConfig | null = null;
  private cycleToken = 0;

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
    const usesNarrationFx = groupParticipants.some(
      (participant) => participant.narrationFxEnabled && participant.ttsProvider !== "none"
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

    if (usesNarrationFx && !elevenLabsState.apiKeyPresent) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "Narration FX requires an ElevenLabs API key.",
        recoverable: false
      });
      throw new Error("Narration FX requires an ElevenLabs API key.");
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
    this.queueUserNarrationEffect(userTurnId, text);

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
    this.queueUserNarrationEffect(userTurnId, transcript.text);

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
    this.cycleToken += 1;
    this.emit({
      type: "assistant.interrupted",
      reason
    });
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
    this.emitUserTurnPending(this.getUserTurnMessage());
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
    const maxTurns = groupMirror.manualTurnTaking
      ? 1
      : Math.max(1, groupMirror.autoTurnLimit || MAX_AUTOMATIC_KINDROID_GROUP_TURNS);
    const cycleToken = ++this.cycleToken;

    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
      if (this.isCycleInterrupted(cycleToken)) {
        return;
      }

      const forcedParticipant =
        turnIndex === 0 && options?.forcedParticipantId
          ? this.resolveParticipantById(options.forcedParticipantId)
          : null;
      const turnResolution = forcedParticipant
        ? { type: "participant" as const, participant: forcedParticipant }
        : await this.resolveTurn();

      if (this.isCycleInterrupted(cycleToken)) {
        return;
      }

      if (turnResolution.type === "user") {
        this.emit({
          type: "session.status",
          provider: this.id,
          status: "ready"
        });
        this.emitUserTurnPending("Your turn.");
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

      if (this.isCycleInterrupted(cycleToken)) {
        return;
      }
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

      const narrationEffect = this.selectNarrationEffect(response, respondingParticipant);
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

      if (this.isCycleInterrupted(cycleToken)) {
        return;
      }

      const narrationTiming = await this.queueNarrationEffect(
        assistantTurnId,
        response,
        speechText,
        narrationEffect,
        synthesis.captions[synthesis.captions.length - 1]?.endMs ?? 0,
        respondingParticipant.narrationDelimiter || "*",
        cycleToken
      );
      this.emit({
        type: "assistant.audio.chunk",
        turnId: assistantTurnId,
        sequence: 0,
        format: synthesis.format,
        data: synthesis.audio,
        boundaryGapMs: groupMirror.turnPauseMs,
        startDelayMs: narrationTiming.startDelayMs,
        captionOffsetMs: narrationTiming.captionOffsetMs,
        captions: synthesis.captions,
        captionsMode: synthesis.captionsMode
      });
    }

    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
    this.emitUserTurnPending(
      groupMirror.manualTurnTaking
        ? "Choose who replies next."
        : `Paused after ${maxTurns} turns. Your turn.`
    );
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
    this.emitUserTurnPending(fallbackMessage);
  }

  private isCycleInterrupted(cycleToken: number): boolean {
    return this.cycleToken !== cycleToken;
  }

  private getUserTurnMessage(): string {
    return this.config?.kindroidGroupMirror?.manualTurnTaking
      ? "Choose who replies next."
      : "Your turn.";
  }

  private emitUserTurnPending(message: string): void {
    this.emit({
      type: "conversation.turn.pending",
      provider: this.id,
      turnOwner: "user",
      message
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

  private selectNarrationEffect(
    text: string,
    participant: KindroidParticipant
  ) {
    if (!participant.narrationFxEnabled || participant.ttsProvider === "none") {
      return null;
    }

    const delimiter = participant.narrationDelimiter || "*";
    const narrationSegments = extractDelimitedNarrationSegments(text, delimiter);
    const diagnostics = describeKindroidNarrationEffects(text, delimiter);
    const selectedEffect = selectKindroidNarrationEffect(text, delimiter);
    console.info("[KindroidGroupVoiceIpcTransport] narrationEffect source", {
      delimiter,
      segmentCount: narrationSegments.length,
      segments: diagnostics,
      rawText: text
    });
    console.info("[KindroidGroupVoiceIpcTransport] narrationEffect decision", {
      selected: selectedEffect
        ? {
            sourceText: selectedEffect.sourceText,
            prompt: selectedEffect.prompt
          }
        : null
    });

    return selectedEffect;
  }

  private queueNarrationEffect(
    turnId: string,
    rawText: string,
    speechText: string,
    narrationEffect: ReturnType<typeof selectKindroidNarrationEffect>,
    speechDurationMs: number,
    delimiter: string,
    cycleToken: number
  ): Promise<{ startDelayMs: number; captionOffsetMs: number }> {
    if (!narrationEffect) {
      return Promise.resolve({ startDelayMs: 0, captionOffsetMs: 0 });
    }

    const rawOffsetMs = computeNarrationEffectOffsetMs({
      rawText,
      speechText,
      effect: narrationEffect,
      speechDurationMs,
      delimiter
    });
    const offsetMs = 0;

    console.info("[KindroidGroupVoiceIpcTransport] queueNarrationEffect", {
      turnId,
      sourceText: narrationEffect.sourceText,
      prompt: narrationEffect.prompt,
      gain: narrationEffect.gain,
      rawOffsetMs,
      offsetMs
    });

    const bridge = getCadenceBridge();
    return bridge.elevenlabs
      .synthesizeSoundEffect(narrationEffect.prompt, {
        durationSeconds: narrationEffect.durationSeconds,
        promptInfluence: narrationEffect.promptInfluence
      })
      .then((effect) => {
        if (this.isCycleInterrupted(cycleToken)) {
            console.info("[KindroidGroupVoiceIpcTransport] narrationEffect dropped after interrupt", {
              turnId
            });
            return {
              startDelayMs: 0,
              captionOffsetMs: 0
            };
          }

        console.info("[KindroidGroupVoiceIpcTransport] narrationEffect ready", {
          turnId,
          format: effect.format,
          byteLength: effect.audio.byteLength
        });
          this.emit({
            type: "assistant.audio.effect",
            turnId,
          format: effect.format,
          data: effect.audio,
          gain: narrationEffect.gain,
            offsetMs,
            stitchWithSpeech: true
          });
          const captionOffsetMs = Math.round(narrationEffect.durationSeconds * 1000) + 120;
          return {
            startDelayMs: 0,
            captionOffsetMs
          };
        })
      .catch((error) => {
        console.warn("[KindroidGroupVoiceIpcTransport] narrationEffect failed", {
          turnId,
          message: error instanceof Error ? error.message : String(error)
        });
        return {
          startDelayMs: 0,
          captionOffsetMs: 0
        };
      });
  }

  private queueUserNarrationEffect(turnId: string, text: string): void {
    const fxEnabledParticipants = (this.config?.kindroidParticipants ?? []).filter(
      (participant) => participant.narrationFxEnabled
    );
    if (fxEnabledParticipants.length === 0) {
      return;
    }

    const delimiterCandidates = Array.from(
      new Set([
        "*",
        ...fxEnabledParticipants.map((participant) => participant.narrationDelimiter || "*")
      ])
    );
    const diagnostics = delimiterCandidates.map((delimiter) => ({
      delimiter,
      segments: describeKindroidNarrationEffects(text, delimiter)
    }));
    const selectedCandidate = delimiterCandidates
      .map((delimiter) => ({
        delimiter,
        effect: selectKindroidNarrationEffect(text, delimiter)
      }))
      .find((candidate) => candidate.effect);
    const narrationEffect = selectedCandidate?.effect ?? null;

    console.info("[KindroidGroupVoiceIpcTransport] userNarrationEffect source", {
      delimiters: diagnostics,
      rawText: text
    });
    console.info("[KindroidGroupVoiceIpcTransport] userNarrationEffect decision", {
      selectedDelimiter: selectedCandidate?.delimiter ?? null,
      matched: Boolean(narrationEffect),
      selected: narrationEffect
        ? {
            sourceText: narrationEffect.sourceText,
            prompt: narrationEffect.prompt
          }
        : null
    });

    if (!narrationEffect) {
      return;
    }

    console.info("[KindroidGroupVoiceIpcTransport] userNarrationEffect", {
      turnId,
      sourceText: narrationEffect.sourceText,
      prompt: narrationEffect.prompt
    });

    const bridge = getCadenceBridge();
    void bridge.elevenlabs
      .synthesizeSoundEffect(narrationEffect.prompt, {
        durationSeconds: narrationEffect.durationSeconds,
        promptInfluence: narrationEffect.promptInfluence
      })
      .then((effect) => {
        this.emit({
          type: "assistant.audio.effect",
          turnId,
          format: effect.format,
          data: effect.audio,
          gain: narrationEffect.gain,
          offsetMs: 0
        });
      })
      .catch((error) => {
        console.warn("[KindroidGroupVoiceIpcTransport] userNarrationEffect failed", {
          turnId,
          message: error instanceof Error ? error.message : String(error)
        });
      });
  }
}
