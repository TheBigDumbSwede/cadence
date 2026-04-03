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
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

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
    source.connect(context.destination);

    const now = context.currentTime;
    const startAt = Math.max(now + 0.01, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) {
        this.nextStartTime = 0;
      }
    };
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
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        sampleRate: TARGET_SAMPLE_RATE
      });
    }

    return this.audioContext;
  }

  private scheduleBuffer(audioBuffer: AudioBuffer): void {
    const context = this.getAudioContext();
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const now = context.currentTime;
    const startAt = Math.max(now + 0.01, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) {
        this.nextStartTime = 0;
      }
    };
  }
}
