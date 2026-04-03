import { getCadenceBridge } from "../../bridge";
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

  async connect(config: TransportConfig): Promise<void> {
    this.config = config;
    const state = await getCadenceBridge().text.getState();

    if (!state.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "OPENAI_API_KEY is not configured.",
        recoverable: false
      });
      throw new Error("OPENAI_API_KEY is not configured.");
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

    const response = await getCadenceBridge().text.createResponse(text, {
      instructions: this.config?.instructions,
      model: this.config?.model
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
}
