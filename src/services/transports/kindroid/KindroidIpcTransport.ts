import { getCadenceBridge } from "../../bridge";
import type { LiveConversationTransport, TransportConfig, Unsubscribe } from "../../contracts";
import type { CadenceEvent } from "../../../shared/voice-events";

export class KindroidIpcTransport implements LiveConversationTransport {
  readonly id = "kindroid-text";
  readonly label = "Kindroid";

  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private config: TransportConfig | null = null;

  async connect(config: TransportConfig): Promise<void> {
    this.config = config;
    const state = await getCadenceBridge().kindroid.getState();

    if (!state.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID.",
        recoverable: false
      });
      throw new Error("Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID.");
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

  async sendUserText(text: string): Promise<void> {
    if (!text.trim()) {
      return;
    }

    const userTurnId = crypto.randomUUID();
    this.emit({
      type: "transcript.final",
      turnId: userTurnId,
      text
    });
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "thinking"
    });

    const response = await getCadenceBridge().kindroid.createResponse(text);

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
      message: "Kindroid transport is text-only for now.",
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
