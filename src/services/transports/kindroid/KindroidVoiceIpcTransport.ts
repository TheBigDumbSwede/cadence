import { getCadenceBridge } from "../../bridge";
import type {
  LiveConversationTransport,
  TextTurnInput,
  TransportConfig,
  Unsubscribe
} from "../../contracts";
import type { CadenceEvent } from "../../../shared/voice-events";
import type { KindroidParticipant } from "../../../shared/kindroid-participants";
import {
  computeNarrationEffectOffsetMs,
  describeKindroidNarrationEffects,
  extractDelimitedNarrationSegments,
  selectKindroidNarrationEffect
} from "./narrationEffects";
import { stripKindroidNarrationForSpeech } from "./speechText";

export class KindroidVoiceIpcTransport implements LiveConversationTransport {
  readonly id = "kindroid-voice";
  readonly label = "Kindroid Voice";

  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private config: TransportConfig | null = null;

  async connect(config: TransportConfig): Promise<void> {
    this.config = config;
    const bridge = getCadenceBridge();
    const [openAiState, kindroidState, elevenLabsState, openAiSpeechState] = await Promise.all([
      bridge.openaiAudio.getState(),
      bridge.kindroid.getState(),
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

    if (!kindroidState.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID.",
        recoverable: false
      });
      throw new Error("Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID.");
    }

    const usesElevenLabs = this.config?.model.includes("elevenlabs") ?? true;
    const usesOpenAiSpeech = this.config?.model.includes("openai-tts") ?? false;
    const usesTextOnly = this.config?.model.includes("text-only") ?? false;
    const usesNarrationFx =
      !usesTextOnly && Boolean(this.config?.kindroidActiveParticipant?.narrationFxEnabled);

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
    const userTurnId = crypto.randomUUID();
    this.emit({
      type: "transcript.final",
      turnId: userTurnId,
      text
    });
    this.queueUserNarrationEffect(userTurnId, text);

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
    this.queueUserNarrationEffect(userTurnId, transcript.text);

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

    const bridge = getCadenceBridge();
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "thinking"
    });

    const kindroidResponse = await bridge.kindroid.createResponse(transcript);
    const assistantTurnId = crypto.randomUUID();
    const activeParticipant = this.config?.kindroidActiveParticipant ?? null;

    this.emit({
      type: "assistant.response.delta",
      turnId: assistantTurnId,
      text: kindroidResponse.text
    });
    this.emit({
      type: "assistant.response.completed",
      turnId: assistantTurnId,
      text: kindroidResponse.text
    });

    if (this.config?.model.includes("text-only")) {
      this.emit({
        type: "session.status",
        provider: this.id,
        status: "ready"
      });
      return;
    }

    const narrationEffect = this.selectNarrationEffect(kindroidResponse.text, activeParticipant);
    const speechText = stripKindroidNarrationForSpeech(kindroidResponse.text, {
      enabled: activeParticipant?.filterNarrationForTts ?? true,
      delimiter: activeParticipant?.narrationDelimiter || "*"
    });
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

    const synthesis = this.config?.model.includes("openai-tts")
      ? await bridge.openaiSpeech.synthesize(speechText, {
          voice: this.config?.voice || undefined,
          instructions: this.config?.speechInstructions || undefined
        })
      : await bridge.elevenlabs.synthesize(speechText, {
          voiceId: this.config?.voice || undefined
        });

    const narrationTiming = await this.queueNarrationEffect(
      assistantTurnId,
      kindroidResponse.text,
      speechText,
      narrationEffect,
      synthesis.captions[synthesis.captions.length - 1]?.endMs ?? 0,
      activeParticipant?.narrationDelimiter || "*"
    );
    this.emit({
      type: "assistant.audio.chunk",
      turnId: assistantTurnId,
      sequence: 0,
      format: synthesis.format,
      data: synthesis.audio,
      startDelayMs: narrationTiming.startDelayMs,
      captionOffsetMs: narrationTiming.captionOffsetMs,
      captions: synthesis.captions,
      captionsMode: synthesis.captionsMode
    });
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
  }

  private emit(event: CadenceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private selectNarrationEffect(
    text: string,
    participant: KindroidParticipant | null
  ) {
    if (!participant?.narrationFxEnabled || participant.ttsProvider === "none") {
      return null;
    }

    const delimiter = participant.narrationDelimiter || "*";
    const narrationSegments = extractDelimitedNarrationSegments(text, delimiter);
    const diagnostics = describeKindroidNarrationEffects(text, delimiter);
    const selectedEffect = selectKindroidNarrationEffect(text, delimiter);
    console.info("[KindroidVoiceIpcTransport] narrationEffect source", {
      delimiter,
      segmentCount: narrationSegments.length,
      segments: diagnostics,
      rawText: text
    });
    console.info("[KindroidVoiceIpcTransport] narrationEffect decision", {
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
    delimiter: string
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

    console.info("[KindroidVoiceIpcTransport] queueNarrationEffect", {
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
        console.info("[KindroidVoiceIpcTransport] narrationEffect ready", {
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
        console.warn("[KindroidVoiceIpcTransport] narrationEffect failed", {
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
    const participant = this.config?.kindroidActiveParticipant ?? null;
    if (!participant?.narrationFxEnabled) {
      return;
    }

    const delimiterCandidates = Array.from(
      new Set([participant.narrationDelimiter || "*", "*"])
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

    console.info("[KindroidVoiceIpcTransport] userNarrationEffect source", {
      delimiters: diagnostics,
      rawText: text
    });
    console.info("[KindroidVoiceIpcTransport] userNarrationEffect decision", {
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

    console.info("[KindroidVoiceIpcTransport] userNarrationEffect", {
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
        console.warn("[KindroidVoiceIpcTransport] userNarrationEffect failed", {
          turnId,
          message: error instanceof Error ? error.message : String(error)
        });
      });
  }
}
