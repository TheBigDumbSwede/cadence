import { getCadenceBridge } from "../../bridge";
import { toAppError } from "../../../shared/app-error";
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
        code: "config.kindroid_api_key_missing",
        message: "Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID.",
        recoverable: false
      });
      throw toAppError(
        new Error("Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID."),
        {
          code: "config.kindroid_api_key_missing",
          message: "Kindroid is not configured. Add KINDROID_API_KEY and KINDROID_AI_ID.",
          retryable: false,
          provider: this.id
        }
      );
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

    let response;
    try {
      response = await getCadenceBridge().kindroid.createResponse(text);
    } catch (error) {
      const appError = toAppError(error, {
        code: "provider.kindroid_http_error",
        message: "Kindroid request failed.",
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
