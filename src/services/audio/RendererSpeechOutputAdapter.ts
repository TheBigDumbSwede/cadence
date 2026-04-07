import type { AudioFormat } from "../../shared/voice-events";
import type { SpeechOutputAdapter, SpeechRequest } from "../contracts";
import { PcmAudioPlayer } from "./PcmAudioPlayer";
import { getOutputPlaybackSnapshot } from "./outputPlaybackStore";

export class RendererSpeechOutputAdapter implements SpeechOutputAdapter {
  readonly id = "renderer-pcm-output";
  private readonly pendingSpeechEffects = new Map<
    string,
    Array<{ format: AudioFormat; data: ArrayBuffer; gain?: number }>
  >();

  constructor(private readonly player = new PcmAudioPlayer()) {}

  async speak(_request: SpeechRequest): Promise<void> {
    return Promise.resolve();
  }

  async enqueueAudioChunk(
    turnId: string,
    _sequence: number,
    format: AudioFormat,
    data: ArrayBuffer,
    boundaryGapMs = 0,
    startDelayMs = 0
  ): Promise<void> {
    const boundaryGapSeconds = Math.max(0, boundaryGapMs) / 1000;
    const startDelaySeconds = Math.max(0, startDelayMs) / 1000;
    const pendingEffect = this.pendingSpeechEffects.get(turnId);

    if (pendingEffect && pendingEffect.length > 0 && (format === "mp3" || format === "wav")) {
      this.pendingSpeechEffects.delete(turnId);
      await this.player.enqueueCompositeEncoded(
        [
          ...pendingEffect.map((effectPart, index) => ({
            buffer: effectPart.data,
            gain: effectPart.gain,
            silenceAfterSeconds: index === pendingEffect.length - 1 ? 0.12 : 0.08
          })),
          {
            buffer: data,
            gain: 1
          }
        ],
        {
          boundaryGapSeconds,
          startDelaySeconds,
          turnId,
          speechPartIndex: pendingEffect.length
        }
      );
      return;
    }

    if (pendingEffect) {
      this.pendingSpeechEffects.delete(turnId);
    }

    if (format === "pcm16") {
      await this.player.enqueue(data, { boundaryGapSeconds, startDelaySeconds, turnId });
      return;
    }

    if (format === "mp3" || format === "wav") {
      await this.player.enqueueEncoded(data, {
        boundaryGapSeconds,
        startDelaySeconds,
        turnId
      });
    }
  }

  async enqueueEffectChunk(
    turnId: string,
    format: AudioFormat,
    data: ArrayBuffer,
    options?: { gain?: number; offsetMs?: number; stitchWithSpeech?: boolean }
  ): Promise<void> {
    const playback = getOutputPlaybackSnapshot();
    const elapsedMs =
      playback.activeTurnId === turnId && playback.startedAtMs !== null
        ? Math.max(0, performance.now() - playback.startedAtMs)
        : 0;
    const remainingOffsetMs = Math.max(0, (options?.offsetMs ?? 0) - elapsedMs);

    if (options?.stitchWithSpeech && remainingOffsetMs === 0) {
      const existing = this.pendingSpeechEffects.get(turnId) ?? [];
      existing.push({
        format,
        data,
        gain: options?.gain
      });
      this.pendingSpeechEffects.set(turnId, existing);
      return;
    }

    if (format === "pcm16") {
      await this.player.enqueueFx(data, {
        gain: options?.gain,
        startDelaySeconds: remainingOffsetMs / 1000
      });
      return;
    }

    if (format === "mp3" || format === "wav") {
      await this.player.enqueueFxEncoded(data, {
        gain: options?.gain,
        startDelaySeconds: remainingOffsetMs / 1000
      });
    }
  }

  async interrupt(): Promise<void> {
    this.pendingSpeechEffects.clear();
    this.player.interrupt();
  }
}
