import type { AudioFormat } from "../../shared/voice-events";
import type { SpeechOutputAdapter, SpeechRequest } from "../contracts";
import { PcmAudioPlayer } from "./PcmAudioPlayer";

export class RendererSpeechOutputAdapter implements SpeechOutputAdapter {
  readonly id = "renderer-pcm-output";

  constructor(private readonly player = new PcmAudioPlayer()) {}

  async speak(_request: SpeechRequest): Promise<void> {
    return Promise.resolve();
  }

  async enqueueAudioChunk(
    _turnId: string,
    _sequence: number,
    format: AudioFormat,
    data: ArrayBuffer
  ): Promise<void> {
    if (format === "pcm16") {
      await this.player.enqueue(data);
      return;
    }

    if (format === "mp3" || format === "wav") {
      await this.player.enqueueEncoded(data);
    }
  }

  async interrupt(): Promise<void> {
    this.player.interrupt();
  }
}
