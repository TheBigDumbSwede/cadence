import type {
  ConversationEngine,
  LiveConversationTransport,
  SpeechOutputAdapter,
  TextTurnInput,
  TranscriptAdapter,
  TransportConfig,
  Unsubscribe
} from "./contracts";
import type { CadenceEvent } from "../shared/voice-events";

type CadenceSessionDependencies = {
  transport: LiveConversationTransport;
  conversationEngine?: ConversationEngine;
  transcriptAdapter?: TranscriptAdapter;
  speechOutputAdapter?: SpeechOutputAdapter;
};

export class CadenceSession {
  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private transportSubscription: Unsubscribe | null = null;

  constructor(private readonly dependencies: CadenceSessionDependencies) {}

  async connect(config: TransportConfig): Promise<void> {
    this.transportSubscription = this.dependencies.transport.subscribe((event) => {
      if (
        event.type === "assistant.audio.chunk" &&
        this.dependencies.speechOutputAdapter
      ) {
        void this.dependencies.speechOutputAdapter.enqueueAudioChunk(
          event.turnId,
          event.sequence,
          event.format,
          event.data
        );
      }

      this.emit(event);
    });

    await this.dependencies.transport.connect(config);
  }

  async disconnect(): Promise<void> {
    this.transportSubscription?.();
    this.transportSubscription = null;
    await this.dependencies.transport.disconnect();
  }

  async interrupt(): Promise<void> {
    await this.dependencies.transport.interruptAssistant("operator_stop");
    await this.dependencies.speechOutputAdapter?.interrupt();
  }

  async sendUserText(text: string, turns?: TextTurnInput[]): Promise<void> {
    await this.dependencies.transport.sendUserText(text, turns);
  }

  async sendUserAudio(audio: ArrayBuffer): Promise<void> {
    await this.dependencies.transport.sendUserAudio(audio);
  }

  async playAssistantAudioChunk(
    event: Extract<CadenceEvent, { type: "assistant.audio.chunk" }>
  ): Promise<void> {
    if (this.dependencies.speechOutputAdapter) {
      await this.dependencies.speechOutputAdapter.enqueueAudioChunk(
        event.turnId,
        event.sequence,
        event.format,
        event.data
      );
    }

    this.emit(event);
  }

  subscribe(listener: (event: CadenceEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  describeTopology(): {
    transport: string;
    transcript: string;
    speech: string;
    reasoning: string;
  } {
    return {
      transport: this.dependencies.transport.label,
      transcript: this.dependencies.transcriptAdapter?.id ?? "embedded in transport",
      speech: this.dependencies.speechOutputAdapter?.id ?? "embedded in transport",
      reasoning: this.dependencies.conversationEngine
        ? "separate conversation engine"
        : "embedded in transport"
    };
  }

  private emit(event: CadenceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
