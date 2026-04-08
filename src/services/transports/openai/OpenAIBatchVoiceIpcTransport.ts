import { getCadenceBridge } from "../../bridge";
import type {
  MemoryRecallResult,
  MemoryScope,
  MemoryTurn
} from "../../../shared/memory-control";
import type {
  LiveConversationTransport,
  TextTurnInput,
  TransportConfig,
  Unsubscribe
} from "../../contracts";
import type { CadenceEvent } from "../../../shared/voice-events";

export class OpenAIBatchVoiceIpcTransport implements LiveConversationTransport {
  readonly id = "openai-batch-voice";
  readonly label = "OpenAI Voice";

  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private config: TransportConfig | null = null;
  private conversationId = crypto.randomUUID();

  private getResponsesModel(): string | undefined {
    const model = this.config?.model;
    if (!model) {
      return undefined;
    }

    return model.split("+", 1)[0] || undefined;
  }

  async connect(config: TransportConfig): Promise<void> {
    this.config = config;
    this.conversationId = crypto.randomUUID();
    const bridge = getCadenceBridge();
    const [openAiAudioState, textState, elevenLabsState, openAiSpeechState] = await Promise.all([
      bridge.openaiAudio.getState(),
      bridge.text.getState(),
      bridge.elevenlabs.getState(),
      bridge.openaiSpeech.getState()
    ]);

    if (!openAiAudioState.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "OpenAI transcription is not configured.",
        recoverable: false
      });
      throw new Error("OpenAI transcription is not configured.");
    }

    if (!textState.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "OpenAI Responses is not configured.",
        recoverable: false
      });
      throw new Error("OpenAI Responses is not configured.");
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
    await this.closeMemorySession();
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "disconnected"
    });
  }

  async sendUserText(text: string, turns: TextTurnInput[] = []): Promise<void> {
    const userTurnId = crypto.randomUUID();
    this.emit({
      type: "transcript.final",
      turnId: userTurnId,
      text
    });

    await this.respondFromText(text, turns);
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

    await this.respondFromText(transcript.text);
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

  private async respondFromText(
    input: string,
    turns: TextTurnInput[] = []
  ): Promise<void> {
    if (!input.trim()) {
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

    const memoryContext = await this.recallMemory(input, turns);
    const response = await bridge.text.createResponse(input, {
      instructions: this.config?.instructions,
      model: this.getResponsesModel(),
      memoryContext
    });

    const assistantTurnId = crypto.randomUUID();
    this.emit({
      type: "assistant.response.delta",
      turnId: assistantTurnId,
      text: response.text
    });
    this.emit({
      type: "assistant.response.completed",
      turnId: assistantTurnId,
      text: response.text
    });
    await this.ingestMemory(turns, input, response.text);

    if (this.config?.model.includes("text-only")) {
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
      ? await bridge.openaiSpeech.synthesize(response.text, {
          voice: this.config?.voice || undefined,
          instructions: this.config?.speechInstructions || undefined
        })
      : await bridge.elevenlabs.synthesize(response.text, {
          voiceId: this.config?.voice || undefined
        });

    this.emit({
      type: "assistant.audio.chunk",
      turnId: assistantTurnId,
      sequence: 0,
      format: synthesis.format,
      data: synthesis.audio,
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

  private getMemoryScope(): MemoryScope {
    return {
      profileId: "default",
      conversationId: this.conversationId,
      backend: "openai-batch"
    };
  }

  private async recallMemory(
    text: string,
    turns: TextTurnInput[]
  ): Promise<string | undefined> {
    try {
      const result = await getCadenceBridge().memory.recall({
        scope: this.getMemoryScope(),
        recentTurns: this.buildRecentTurns(turns, text)
      });

      return this.extractContextBlock(result);
    } catch (error) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message:
          error instanceof Error ? error.message : "Memory recall failed.",
        recoverable: true
      });
      return undefined;
    }
  }

  private async ingestMemory(
    turns: TextTurnInput[],
    userText: string,
    assistantText: string
  ): Promise<void> {
    try {
      await getCadenceBridge().memory.ingest({
        scope: this.getMemoryScope(),
        turns: this.buildRecentTurns(turns, userText, assistantText),
        reason: "turn"
      });
    } catch (error) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message:
          error instanceof Error ? error.message : "Memory ingest failed.",
        recoverable: true
      });
    }
  }

  private async closeMemorySession(): Promise<void> {
    try {
      await getCadenceBridge().memory.closeSession(this.getMemoryScope());
    } catch (error) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message:
          error instanceof Error ? error.message : "Memory session close failed.",
        recoverable: true
      });
    }
  }

  private buildRecentTurns(
    turns: TextTurnInput[],
    userText: string,
    assistantText?: string
  ): MemoryTurn[] {
    const recentTurns = turns.slice(-6).map((turn) => ({
      role: turn.speaker,
      text: turn.text
    } satisfies MemoryTurn));

    recentTurns.push({
      role: "user",
      text: userText
    });

    if (assistantText) {
      recentTurns.push({
        role: "assistant",
        text: assistantText
      });
    }

    return recentTurns;
  }

  private extractContextBlock(result: MemoryRecallResult): string | undefined {
    const contextBlock = result.contextBlock.trim();
    return contextBlock ? contextBlock : undefined;
  }
}
