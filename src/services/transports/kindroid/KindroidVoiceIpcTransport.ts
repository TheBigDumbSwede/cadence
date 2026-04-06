import { getCadenceBridge } from "../../bridge";
import type {
  LiveConversationTransport,
  TextTurnInput,
  TransportConfig,
  Unsubscribe
} from "../../contracts";
import type { CadenceEvent } from "../../../shared/voice-events";
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

    const bridge = getCadenceBridge();
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "thinking"
    });

    const kindroidResponse = await bridge.kindroid.createResponse(transcript);
    const assistantTurnId = crypto.randomUUID();

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

    const speechText = stripKindroidNarrationForSpeech(kindroidResponse.text, {
      enabled: this.config?.kindroidActiveParticipant?.filterNarrationForTts ?? true,
      delimiter:
        this.config?.kindroidActiveParticipant?.narrationDelimiter || "*"
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

  private emit(event: CadenceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
