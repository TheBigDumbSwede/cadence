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
  formatNarrationEffectCaption,
  type SelectedNarrationEffect
} from "./narrationEffects";
import {
  selectNarrationEffectFromDelimitersWithModel,
  selectNarrationEffectWithModel
} from "./narrationEffectSelection";
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
    void this.queueUserNarrationEffect(userTurnId, text);

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
    void this.queueUserNarrationEffect(userTurnId, transcript.text);

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

    const narrationEffect = await this.selectNarrationEffect(
      kindroidResponse.text,
      activeParticipant
    );
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
      narrationEffect,
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

  private async selectNarrationEffect(
    text: string,
    participant: KindroidParticipant | null
  ): Promise<SelectedNarrationEffect | null> {
    if (!participant?.narrationFxEnabled || participant.ttsProvider === "none") {
      return null;
    }

    const delimiter = participant.narrationDelimiter || "*";
    return selectNarrationEffectWithModel(getCadenceBridge().text, text, delimiter);
  }

  private queueNarrationEffect(
    turnId: string,
    narrationEffect: SelectedNarrationEffect | null
  ): Promise<{ startDelayMs: number; captionOffsetMs: number }> {
    if (!narrationEffect) {
      return Promise.resolve({ startDelayMs: 0, captionOffsetMs: 0 });
    }

    const offsetMs = 0;

    const bridge = getCadenceBridge();
    const captionText = formatNarrationEffectCaption(narrationEffect);
    return Promise.all(
      narrationEffect.beats.map((beat) =>
        bridge.elevenlabs
          .synthesizeSoundEffect(beat.prompt, {
            durationSeconds: beat.durationSeconds,
            promptInfluence: narrationEffect.promptInfluence
          })
          .then((effect) => ({
            beat,
            effect
          }))
      )
    )
      .then((results) => {
        for (const result of results) {
          this.emit({
            type: "assistant.audio.effect",
            turnId,
            format: result.effect.format,
            data: result.effect.audio,
            gain: result.beat.gain,
            offsetMs,
            stitchWithSpeech: true,
            captionText
          });
        }
        const captionOffsetMs =
          results.reduce(
            (sum, result, index) =>
              sum +
              Math.round(result.beat.durationSeconds * 1000) +
              (index === results.length - 1 ? 120 : 80),
            0
          );
        return {
          startDelayMs: 0,
          captionOffsetMs
        };
      })
      .catch(() => {
        return {
          startDelayMs: 0,
          captionOffsetMs: 0
        };
      });
  }

  private async queueUserNarrationEffect(turnId: string, text: string): Promise<void> {
    const participant = this.config?.kindroidActiveParticipant ?? null;
    if (!participant?.narrationFxEnabled) {
      return;
    }

    const delimiterCandidates = Array.from(
      new Set([participant.narrationDelimiter || "*", "*"])
    );
    const { effect: narrationEffect } = await selectNarrationEffectFromDelimitersWithModel(
      getCadenceBridge().text,
      text,
      delimiterCandidates
    );

    if (!narrationEffect) {
      return;
    }

    const bridge = getCadenceBridge();
    void Promise.all(
      narrationEffect.beats.map((beat) =>
        bridge.elevenlabs
          .synthesizeSoundEffect(beat.prompt, {
            durationSeconds: beat.durationSeconds,
            promptInfluence: narrationEffect.promptInfluence
          })
          .then((effect) => ({ beat, effect }))
      )
    )
      .then((results) => {
        for (const result of results) {
          this.emit({
            type: "assistant.audio.effect",
            turnId,
            format: result.effect.format,
            data: result.effect.audio,
            gain: result.beat.gain,
            offsetMs: 0,
            captionText: formatNarrationEffectCaption(narrationEffect)
          });
        }
      })
      .catch(() => undefined);
  }
}
