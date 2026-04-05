import {
  publishOutputWaveform,
  resetOutputWaveform
} from "./outputWaveformStore";

const TARGET_SAMPLE_RATE = 24000;

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

  async enqueue(buffer: ArrayBuffer): Promise<void> {
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

    const now = context.currentTime;
    const startAt = Math.max(now + 0.01, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) {
        this.nextStartTime = 0;
        this.stopMonitoring();
      }
    };

    this.startMonitoring();
  }

  async enqueueEncoded(buffer: ArrayBuffer): Promise<void> {
    const context = this.getAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const decoded = await context.decodeAudioData(buffer.slice(0));
    this.scheduleBuffer(decoded);
  }

  interrupt(): void {
    for (const source of this.activeSources) {
      source.stop();
    }

    this.activeSources.clear();
    this.nextStartTime = 0;
    this.stopMonitoring();
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

  private scheduleBuffer(audioBuffer: AudioBuffer): void {
    const context = this.getAudioContext();
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.getAnalyser(context));

    const now = context.currentTime;
    const startAt = Math.max(now + 0.01, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
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
