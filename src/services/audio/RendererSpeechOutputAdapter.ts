import type { AudioFormat } from "../../shared/voice-events";
import type { SpeechOutputAdapter, SpeechRequest } from "../contracts";
import { PcmAudioPlayer } from "./PcmAudioPlayer";

const MINIMUM_TURN_GAP_SECONDS = 0.5;

export class RendererSpeechOutputAdapter implements SpeechOutputAdapter {
  readonly id = "renderer-pcm-output";
  private lastTurnId: string | null = null;

  constructor(private readonly player = new PcmAudioPlayer()) {}

  async speak(_request: SpeechRequest): Promise<void> {
    return Promise.resolve();
  }

  async enqueueAudioChunk(
    turnId: string,
    _sequence: number,
    format: AudioFormat,
    data: ArrayBuffer
  ): Promise<void> {
    const boundaryGapSeconds =
      this.lastTurnId && this.lastTurnId !== turnId ? MINIMUM_TURN_GAP_SECONDS : 0;
    this.lastTurnId = turnId;

    if (format === "pcm16") {
      await this.player.enqueue(data, { boundaryGapSeconds });
      return;
    }

    if (format === "mp3" || format === "wav") {
      await this.player.enqueueEncoded(data, { boundaryGapSeconds });
    }
  }

  async interrupt(): Promise<void> {
    this.lastTurnId = null;
    this.player.interrupt();
  }
}
