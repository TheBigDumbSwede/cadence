import type { LiveConversationTransport, TransportConfig, Unsubscribe } from "../../contracts";
import type { CadenceEvent } from "../../../shared/voice-events";

export class OpenAIRealtimeTransport implements LiveConversationTransport {
  readonly id = "openai-realtime";
  readonly label = "OpenAI Realtime";

  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private config: TransportConfig | null = null;

  async connect(config: TransportConfig): Promise<void> {
    this.config = config;
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "connecting"
    });

    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
  }

  async disconnect(): Promise<void> {
    this.config = null;
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "disconnected"
    });
  }

  async sendUserText(text: string): Promise<void> {
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
  }

  async sendUserAudio(_audio: ArrayBuffer): Promise<void> {
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "listening"
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
