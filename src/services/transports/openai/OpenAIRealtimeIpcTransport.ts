import type {
  LiveConversationTransport,
  TextTurnInput,
  TransportConfig,
  Unsubscribe
} from "../../contracts";
import { getCadenceBridge } from "../../bridge";
import type { CadenceEvent } from "../../../shared/voice-events";

export class OpenAIRealtimeIpcTransport implements LiveConversationTransport {
  readonly id = "openai-realtime";
  readonly label = "OpenAI Realtime";

  connect(config: TransportConfig): Promise<void> {
    return getCadenceBridge().realtime.connect({
      model: config.model,
      voice: config.voice,
      instructions: config.instructions,
      modalities: config.modalities
    });
  }

  disconnect(): Promise<void> {
    return getCadenceBridge().realtime.disconnect();
  }

  sendUserText(text: string, _turns?: TextTurnInput[]): Promise<void> {
    return getCadenceBridge().realtime.sendUserText(text);
  }

  sendUserAudio(audio: ArrayBuffer): Promise<void> {
    return getCadenceBridge().realtime.sendUserAudio(audio);
  }

  interruptAssistant(reason?: "user_barge_in" | "operator_stop"): Promise<void> {
    return getCadenceBridge().realtime.interruptAssistant(reason);
  }

  subscribe(listener: (event: CadenceEvent) => void): Unsubscribe {
    return getCadenceBridge().realtime.onEvent(listener);
  }
}
