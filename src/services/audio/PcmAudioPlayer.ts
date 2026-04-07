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
const DEFAULT_FX_GAIN = 0.75;
const MASTER_HEADROOM_GAIN = 0.96;

type EnqueuePlaybackOptions = {
  boundaryGapSeconds?: number;
  startDelaySeconds?: number;
  turnId?: string | null;
  gain?: number;
  speechOffsetSeconds?: number;
};

type EncodedAudioPart = {
  buffer: ArrayBuffer;
  gain?: number;
  silenceAfterSeconds?: number;
};

type ScheduledPlayback = {
  source: AudioBufferSourceNode;
  startAt: number;
  turnId: string | null;
  started: boolean;
  startTimerId: number | null;
  startedAtMs: number | null;
  durationMs: number;
  speechOffsetMs: number | null;
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
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private unlockHandler: (() => void) | null = null;
  private monitorFrameId = 0;
  private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
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
    this.connectSource(source, context, options);
    this.scheduleSource(source, audioBuffer.duration, options);
  }

  async enqueueFx(
    buffer: ArrayBuffer,
    options?: Omit<EnqueuePlaybackOptions, "turnId" | "boundaryGapSeconds">
  ): Promise<void> {
    await this.enqueue(buffer, {
      turnId: null,
      gain: options?.gain ?? DEFAULT_FX_GAIN,
      startDelaySeconds: options?.startDelaySeconds
    });
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

  async enqueueFxEncoded(
    buffer: ArrayBuffer,
    options?: Omit<EnqueuePlaybackOptions, "turnId" | "boundaryGapSeconds">
  ): Promise<void> {
    await this.enqueueEncoded(buffer, {
      turnId: null,
      gain: options?.gain ?? DEFAULT_FX_GAIN,
      startDelaySeconds: options?.startDelaySeconds
    });
  }

  async enqueueCompositeEncoded(
    parts: EncodedAudioPart[],
    options?: Omit<EnqueuePlaybackOptions, "gain"> & { speechPartIndex?: number }
  ): Promise<void> {
    const context = this.getAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    if (parts.length === 0) {
      return;
    }

    const decodedParts = await Promise.all(
      parts.map(async (part) => ({
        buffer: await context.decodeAudioData(part.buffer.slice(0)),
        gain: Math.max(0, part.gain ?? 1),
        silenceAfterSeconds: Math.max(0, part.silenceAfterSeconds ?? 0)
      }))
    );

    const channelCount = Math.max(...decodedParts.map((part) => part.buffer.numberOfChannels));
    const totalLength = decodedParts.reduce((sum, part) => {
      return (
        sum +
        part.buffer.length +
        Math.round(part.silenceAfterSeconds * context.sampleRate)
      );
    }, 0);

    const output = context.createBuffer(channelCount, totalLength, context.sampleRate);
    let cursor = 0;
    let speechOffsetSeconds = 0;

    for (const [index, part] of decodedParts.entries()) {
      if (index === (options?.speechPartIndex ?? decodedParts.length - 1)) {
        speechOffsetSeconds = cursor / context.sampleRate;
      }

      for (let channel = 0; channel < channelCount; channel += 1) {
        const target = output.getChannelData(channel);
        const source = part.buffer.getChannelData(
          Math.min(channel, part.buffer.numberOfChannels - 1)
        );
        for (let index = 0; index < source.length; index += 1) {
          target[cursor + index] += source[index] * part.gain;
        }
      }

      cursor += part.buffer.length;
      cursor += Math.round(part.silenceAfterSeconds * context.sampleRate);
    }

    this.scheduleBuffer(output, {
      ...options,
      speechOffsetSeconds
    });
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
      const masterGain = this.getMasterGain(context);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.78;
      masterGain.connect(this.analyser);
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
    this.connectSource(source, context, options);
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
    const startDelaySeconds = Math.max(0, options?.startDelaySeconds ?? 0);
    const startAt = Math.max(
      now + DEFAULT_START_LEAD_SECONDS + startDelaySeconds,
      hasQueuedAudio
        ? this.nextStartTime + gapSeconds
        : now + DEFAULT_START_LEAD_SECONDS + startDelaySeconds
    );

    source.start(startAt);
    this.nextStartTime = startAt + durationSeconds;
    this.activeSources.add(source);
    const playback: ScheduledPlayback = {
      source,
      startAt,
      turnId: options?.turnId ?? null,
      started: false,
      startTimerId: null,
      startedAtMs: null,
      durationMs: Math.round(durationSeconds * 1000),
      speechOffsetMs: Math.max(0, Math.round((options?.speechOffsetSeconds ?? 0) * 1000))
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
    if (this.monitorFrameId !== 0 && typeof window === "undefined") {
      return;
    }

    if (this.monitorFrameId !== 0 && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.monitorFrameId);
      this.monitorFrameId = 0;
    }

    resetOutputWaveform();
  }

  private schedulePlaybackStart(playback: ScheduledPlayback): void {
    if (typeof window === "undefined") {
      playback.started = true;
      playback.startedAtMs = globalThis.performance?.now() ?? Date.now();
      this.syncActiveTurn();
      return;
    }

    const context = this.getAudioContext();
    const delayMs = Math.max(0, (playback.startAt - context.currentTime) * 1000);

    playback.startTimerId = window.setTimeout(() => {
      playback.startTimerId = null;
      playback.started = true;
      playback.startedAtMs = performance.now();
      this.syncActiveTurn();
    }, delayMs);
  }

  private syncActiveTurn(): void {
    const nextPlayback = Array.from(this.scheduledPlaybacks.values())
      .filter((playback) => playback.started && playback.turnId)
      .sort((left, right) => left.startAt - right.startAt)[0];
    const nextTurnId = nextPlayback?.turnId ?? null;

    if (this.activeTurnId === nextTurnId) {
      return;
    }

    this.activeTurnId = nextTurnId;
    publishOutputPlayback({
      activeTurnId: this.activeTurnId,
      startedAtMs: nextPlayback?.startedAtMs ?? null,
      durationMs: nextPlayback?.durationMs ?? null,
      speechOffsetMs: nextPlayback?.speechOffsetMs ?? null
    });
  }

  private getMasterGain(context: AudioContext): GainNode {
    if (!this.masterGain) {
      this.masterGain = context.createGain();
      this.masterGain.gain.value = MASTER_HEADROOM_GAIN;
    }

    return this.masterGain;
  }

  private connectSource(
    source: AudioBufferSourceNode,
    context: AudioContext,
    options?: EnqueuePlaybackOptions
  ): void {
    const gainNode = context.createGain();
    gainNode.gain.value = Math.max(0, options?.gain ?? 1);
    gainNode.connect(this.getMasterGain(context));
    source.connect(gainNode);
    this.getAnalyser(context);
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

      void context.resume()
        .then(() => {
          if (context.state === "running") {
            this.removeUnlockHandler();
          }
        })
        .catch(() => undefined);
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
