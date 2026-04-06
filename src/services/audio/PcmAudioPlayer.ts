import {
  publishOutputWaveform,
  resetOutputWaveform
} from "./outputWaveformStore";
import {
  publishOutputPlayback,
  resetOutputPlayback
} from "./outputPlaybackStore";

const TARGET_SAMPLE_RATE = 24000;
const DEFAULT_START_LEAD_SECONDS = 0.01;

type EnqueuePlaybackOptions = {
  boundaryGapSeconds?: number;
  turnId?: string;
};

type ScheduledPlayback = {
  source: AudioBufferSourceNode;
  startAt: number;
  turnId: string | null;
  started: boolean;
  startTimerId: number | null;
};

function pcm16ToFloat32(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const sampleCount = buffer.byteLength / 2;
  const output = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    output[index] = view.getInt16(index * 2, true) / 0x7fff;
  }

  return output;
}

export class PcmAudioPlayer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private unlockHandler: (() => void) | null = null;
  private monitorFrameId = 0;
  private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;
  private scheduledPlaybacks = new Map<AudioBufferSourceNode, ScheduledPlayback>();
  private activeTurnId: string | null = null;

  async enqueue(
    buffer: ArrayBuffer,
    options?: EnqueuePlaybackOptions
  ): Promise<void> {
    const context = this.getAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const samples = Float32Array.from(pcm16ToFloat32(buffer));
    const audioBuffer = context.createBuffer(1, samples.length, TARGET_SAMPLE_RATE);
    audioBuffer.copyToChannel(samples, 0);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.getAnalyser(context));
    this.scheduleSource(source, audioBuffer.duration, options);
  }

  async enqueueEncoded(
    buffer: ArrayBuffer,
    options?: EnqueuePlaybackOptions
  ): Promise<void> {
    const context = this.getAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const decoded = await context.decodeAudioData(buffer.slice(0));
    this.scheduleBuffer(decoded, options);
  }

  interrupt(): void {
    for (const source of this.activeSources) {
      source.stop();
    }

    for (const playback of this.scheduledPlaybacks.values()) {
      if (playback.startTimerId !== null) {
        window.clearTimeout(playback.startTimerId);
      }
    }

    this.activeSources.clear();
    this.scheduledPlaybacks.clear();
    this.activeTurnId = null;
    this.nextStartTime = 0;
    this.stopMonitoring();
    resetOutputPlayback();
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        sampleRate: TARGET_SAMPLE_RATE
      });
      this.bindUnlockHandler();
    }

    return this.audioContext;
  }

  private getAnalyser(context: AudioContext): AnalyserNode {
    if (!this.analyser) {
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.78;
      this.analyser.connect(context.destination);
    }

    if (!this.analyserBuffer || this.analyserBuffer.length !== this.analyser.fftSize) {
      this.analyserBuffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    }

    return this.analyser;
  }

  private scheduleBuffer(
    audioBuffer: AudioBuffer,
    options?: EnqueuePlaybackOptions
  ): void {
    const context = this.getAudioContext();
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.getAnalyser(context));

    this.scheduleSource(source, audioBuffer.duration, options);
  }

  private scheduleSource(
    source: AudioBufferSourceNode,
    durationSeconds: number,
    options?: EnqueuePlaybackOptions
  ): void {
    const context = this.getAudioContext();
    const now = context.currentTime;
    const hasQueuedAudio =
      this.activeSources.size > 0 || this.nextStartTime > now + DEFAULT_START_LEAD_SECONDS;
    const gapSeconds = hasQueuedAudio ? options?.boundaryGapSeconds ?? 0 : 0;
    const startAt = Math.max(
      now + DEFAULT_START_LEAD_SECONDS,
      hasQueuedAudio ? this.nextStartTime + gapSeconds : now + DEFAULT_START_LEAD_SECONDS
    );

    source.start(startAt);
    this.nextStartTime = startAt + durationSeconds;
    this.activeSources.add(source);
    const playback: ScheduledPlayback = {
      source,
      startAt,
      turnId: options?.turnId ?? null,
      started: false,
      startTimerId: null
    };
    this.scheduledPlaybacks.set(source, playback);
    this.schedulePlaybackStart(playback);

    source.onended = () => {
      this.activeSources.delete(source);
      const completedPlayback = this.scheduledPlaybacks.get(source);
      if (completedPlayback && completedPlayback.startTimerId !== null) {
        window.clearTimeout(completedPlayback.startTimerId);
      }
      this.scheduledPlaybacks.delete(source);
      this.syncActiveTurn();
      if (this.activeSources.size === 0) {
        this.nextStartTime = 0;
        this.stopMonitoring();
      }
    };

    this.startMonitoring();
  }

  private startMonitoring(): void {
    if (this.monitorFrameId !== 0 || typeof window === "undefined") {
      return;
    }

    const tick = () => {
      this.monitorFrameId = 0;

      const analyser = this.analyser;
      const buffer = this.analyserBuffer;
      if (!analyser || !buffer) {
        resetOutputWaveform();
        return;
      }

      analyser.getByteTimeDomainData(buffer);
      const samples: number[] = [];
      const sampleStride = Math.max(1, Math.floor(buffer.length / 48));
      let sum = 0;

      for (let index = 0; index < buffer.length; index += 1) {
        const normalized = (buffer[index] - 128) / 128;
        sum += normalized * normalized;
      }

      for (let index = 0; index < 48; index += 1) {
        const sourceIndex = Math.min(buffer.length - 1, index * sampleStride);
        samples.push((buffer[sourceIndex] - 128) / 128);
      }

      const level = Math.min(1, Math.sqrt(sum / buffer.length) * 3.4);
      publishOutputWaveform({
        active: this.activeSources.size > 0,
        level,
        samples
      });

      if (this.activeSources.size > 0) {
        this.monitorFrameId = window.requestAnimationFrame(tick);
      } else {
        this.stopMonitoring();
      }
    };

    this.monitorFrameId = window.requestAnimationFrame(tick);
  }

  private stopMonitoring(): void {
    if (this.monitorFrameId !== 0 && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.monitorFrameId);
      this.monitorFrameId = 0;
    }

    resetOutputWaveform();
  }

  private schedulePlaybackStart(playback: ScheduledPlayback): void {
    if (typeof window === "undefined") {
      playback.started = true;
      this.syncActiveTurn();
      return;
    }

    const context = this.getAudioContext();
    const delayMs = Math.max(0, (playback.startAt - context.currentTime) * 1000);

    playback.startTimerId = window.setTimeout(() => {
      playback.startTimerId = null;
      playback.started = true;
      this.syncActiveTurn();
    }, delayMs);
  }

  private syncActiveTurn(): void {
    const nextPlayback = Array.from(this.scheduledPlaybacks.values())
      .filter((playback) => playback.started)
      .sort((left, right) => left.startAt - right.startAt)[0];
    const nextTurnId = nextPlayback?.turnId ?? null;

    if (this.activeTurnId === nextTurnId) {
      return;
    }

    this.activeTurnId = nextTurnId;
    publishOutputPlayback({
      activeTurnId: this.activeTurnId
    });
  }

  private bindUnlockHandler(): void {
    if (this.unlockHandler || typeof window === "undefined") {
      return;
    }

    this.unlockHandler = () => {
      const context = this.audioContext;
      if (!context) {
        return;
      }

      if (context.state === "running") {
        this.removeUnlockHandler();
        return;
      }

      void context.resume().then(() => {
        if (context.state === "running") {
          this.removeUnlockHandler();
        }
      }).catch(() => undefined);
    };

    window.addEventListener("pointerdown", this.unlockHandler, { passive: true });
    window.addEventListener("keydown", this.unlockHandler);
    window.addEventListener("touchstart", this.unlockHandler, { passive: true });
  }

  private removeUnlockHandler(): void {
    if (!this.unlockHandler || typeof window === "undefined") {
      return;
    }

    window.removeEventListener("pointerdown", this.unlockHandler);
    window.removeEventListener("keydown", this.unlockHandler);
    window.removeEventListener("touchstart", this.unlockHandler);
    this.unlockHandler = null;
  }
}
