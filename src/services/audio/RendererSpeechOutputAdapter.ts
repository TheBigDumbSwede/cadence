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
    turnId: string,
    _sequence: number,
    format: AudioFormat,
    data: ArrayBuffer,
    boundaryGapMs = 0
  ): Promise<void> {
    const boundaryGapSeconds = Math.max(0, boundaryGapMs) / 1000;

    if (format === "pcm16") {
      await this.player.enqueue(data, { boundaryGapSeconds, turnId });
      return;
    }

    if (format === "mp3" || format === "wav") {
      await this.player.enqueueEncoded(data, { boundaryGapSeconds, turnId });
    }
  }

  async interrupt(): Promise<void> {
    this.player.interrupt();
  }
}
