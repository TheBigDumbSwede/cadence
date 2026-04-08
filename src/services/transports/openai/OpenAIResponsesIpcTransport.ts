import { getCadenceBridge } from "../../bridge";
import { toAppError } from "../../../shared/app-error";
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

export class OpenAIResponsesIpcTransport implements LiveConversationTransport {
  readonly id = "openai-responses";
  readonly label = "OpenAI Responses";

  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private config: TransportConfig | null = null;
  private conversationId = crypto.randomUUID();

  async connect(config: TransportConfig): Promise<void> {
    this.config = config;
    this.conversationId = crypto.randomUUID();
    const state = await getCadenceBridge().text.getState();

    if (!state.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        code: "config.openai_api_key_missing",
        message: "OPENAI_API_KEY is not configured.",
        recoverable: false
      });
      throw toAppError(new Error("OPENAI_API_KEY is not configured."), {
        code: "config.openai_api_key_missing",
        message: "OPENAI_API_KEY is not configured.",
        retryable: false,
        provider: this.id
      });
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
    if (!text.trim()) {
      return;
    }

    const turnId = crypto.randomUUID();
    this.emit({
      type: "transcript.final",
      turnId,
      text
    });
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "thinking"
    });

    const memoryContext = await this.recallMemory(text, turns);
    let response;
    try {
      response = await getCadenceBridge().text.createResponse(text, {
        instructions: this.config?.instructions,
        model: this.config?.model,
        memoryContext
      });
    } catch (error) {
      const appError = toAppError(error, {
        code: "provider.openai_http_error",
        message: "OpenAI Responses request failed.",
        retryable: true,
        provider: this.id
      });
      this.emit({
        type: "transport.error",
        provider: this.id,
        code: appError.code,
        message: appError.message,
        recoverable: appError.retryable
      });
      throw appError;
    }

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
    await this.ingestMemory(turns, text, response.text);
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
  }

  async sendUserAudio(_audio: ArrayBuffer): Promise<void> {
    this.emit({
      type: "transport.error",
      provider: this.id,
      code: "transport.unsupported_mode",
      message: "Audio capture is not available in text-only mode.",
      recoverable: true
    });
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

  private emit(event: CadenceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private getMemoryScope(): MemoryScope {
    return {
      profileId: "default",
      conversationId: this.conversationId,
      backend: "openai-responses"
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

      const contextBlock = this.extractContextBlock(result);
      this.emit({
        type: "memory.recall",
        provider: this.id,
        contextBlock: contextBlock ?? ""
      });
      return contextBlock;
    } catch (error) {
      const appError = toAppError(error, {
        code: "provider.memory_backend_error",
        message: "Memory recall failed.",
        retryable: true,
        provider: "memory"
      });
      this.emit({
        type: "transport.error",
        provider: this.id,
        code: appError.code,
        message: appError.message,
        recoverable: appError.retryable
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
      const result = await getCadenceBridge().memory.ingest({
        scope: this.getMemoryScope(),
        turns: this.buildRecentTurns(turns, userText, assistantText),
        reason: "turn"
      });
      this.emit({
        type: "memory.ingest",
        provider: this.id,
        written: result.written,
        updated: result.updated,
        ignored: result.ignored
      });
    } catch (error) {
      const appError = toAppError(error, {
        code: "provider.memory_backend_error",
        message: "Memory ingest failed.",
        retryable: true,
        provider: "memory"
      });
      this.emit({
        type: "transport.error",
        provider: this.id,
        code: appError.code,
        message: appError.message,
        recoverable: appError.retryable
      });
    }
  }

  private async closeMemorySession(): Promise<void> {
    try {
      await getCadenceBridge().memory.closeSession(this.getMemoryScope());
    } catch (error) {
      const appError = toAppError(error, {
        code: "provider.memory_backend_error",
        message: "Memory session close failed.",
        retryable: true,
        provider: "memory"
      });
      this.emit({
        type: "transport.error",
        provider: this.id,
        code: appError.code,
        message: appError.message,
        recoverable: appError.retryable
      });
    }
  }

  private buildRecentTurns(
    turns: TextTurnInput[],
    userText: string,
    assistantText?: string
  ): MemoryTurn[] {
    const recentTurns = turns.slice(-6).map(
      (turn) =>
        ({
          role: turn.speaker,
          text: turn.text
        }) satisfies MemoryTurn
    );

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
