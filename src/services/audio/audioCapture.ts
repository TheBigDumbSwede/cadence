const TARGET_SAMPLE_RATE = 24000;
const HOT_MIC_THRESHOLD = 0.026;
const HOT_MIC_START_MS = 70;
const HOT_MIC_END_SILENCE_MS = 860;
const HOT_MIC_MIN_UTTERANCE_MS = 360;
const HOT_MIC_COOLDOWN_MS = 420;

function toMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) {
    return channelData[0];
  }

  const sampleCount = channelData[0].length;
  const output = new Float32Array(sampleCount);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let sum = 0;
    for (const channel of channelData) {
      sum += channel[sampleIndex];
    }
    output[sampleIndex] = sum / channelData.length;
  }

  return output;
}

function floatTo16BitPcm(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

async function resampleBlob(blob: Blob): Promise<ArrayBuffer> {
  const sourceContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const decoded = await sourceContext.decodeAudioData(arrayBuffer.slice(0));
  const offlineContext = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * TARGET_SAMPLE_RATE),
    TARGET_SAMPLE_RATE
  );
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start(0);
  const rendered = await offlineContext.startRendering();

  sourceContext.close().catch(() => undefined);

  const channels = Array.from({ length: rendered.numberOfChannels }, (_, index) =>
    rendered.getChannelData(index)
  );

  return floatTo16BitPcm(toMono(channels));
}

function getSupportedMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

type RecorderSegment = {
  recorder: MediaRecorder;
  chunks: BlobPart[];
};

async function getAudioStream(existingStream?: MediaStream | null): Promise<MediaStream> {
  if (existingStream) {
    return existingStream;
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
  });
}

function createRecorderSegment(stream: MediaStream): RecorderSegment {
  const mimeType = getSupportedMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  return {
    recorder,
    chunks
  };
}

async function stopRecorderSegment(segment: RecorderSegment | null): Promise<ArrayBuffer> {
  if (!segment || segment.recorder.state === "inactive") {
    return new ArrayBuffer(0);
  }

  await new Promise<void>((resolve) => {
    segment.recorder.addEventListener("stop", () => resolve(), { once: true });
    segment.recorder.stop();
  });

  const blob = new Blob(segment.chunks, {
    type: segment.recorder.mimeType || "audio/webm"
  });

  return resampleBlob(blob);
}

export class PushToTalkRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<void> {
    if (this.recorder?.state === "recording") {
      return;
    }

    this.stream = await getAudioStream(this.stream);

    const mimeType = getSupportedMimeType();
    this.chunks = [];
    this.recorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    });

    this.recorder.start();
  }

  async stop(): Promise<ArrayBuffer> {
    const recorder = this.recorder;

    if (!recorder || recorder.state === "inactive") {
      return new ArrayBuffer(0);
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });

    const blob = new Blob(this.chunks, {
      type: recorder.mimeType || "audio/webm"
    });

    this.recorder = null;
    this.chunks = [];

    return resampleBlob(blob);
  }
}

export type HotMicMonitorState =
  | "idle"
  | "armed"
  | "capturing"
  | "waiting_for_end_silence"
  | "cooldown"
  | "suppressed";

type HotMicCallbacks = {
  onSpeechStart?: () => void;
  onStateChange?: (state: HotMicMonitorState) => void;
  onUtterance: (audio: ArrayBuffer) => Promise<void> | void;
};

export class HotMicRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private rafId = 0;
  private segment: RecorderSegment | null = null;
  private callbacks: HotMicCallbacks | null = null;
  private state: HotMicMonitorState = "idle";
  private suppressed = false;
  private speechDetectedAt: number | null = null;
  private silenceDetectedAt: number | null = null;
  private utteranceStartedAt: number | null = null;
  private cooldownUntil = 0;
  private processingUtterance = false;

  async start(callbacks: HotMicCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.stream = await getAudioStream(this.stream);

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    if (!this.analyser) {
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.72;
      this.sourceNode.connect(this.analyser);
    }

    this.setState(this.suppressed ? "suppressed" : "armed");
    if (!this.rafId) {
      this.tick();
    }
  }

  async stop(): Promise<void> {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    this.speechDetectedAt = null;
    this.silenceDetectedAt = null;
    this.utteranceStartedAt = null;
    this.processingUtterance = false;
    this.cooldownUntil = 0;

    await stopRecorderSegment(this.segment);
    this.segment = null;
    this.setState("idle");
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (suppressed) {
      this.speechDetectedAt = null;
      this.silenceDetectedAt = null;
      if (!this.processingUtterance) {
        this.setState("suppressed");
      }
      return;
    }

    this.cooldownUntil = 0;
    this.speechDetectedAt = null;
    this.silenceDetectedAt = null;

    if (
      !this.processingUtterance &&
      this.state !== "capturing" &&
      this.state !== "waiting_for_end_silence"
    ) {
      this.setState("armed");
    }
  }

  private tick = () => {
    this.rafId = 0;
    if (!this.analyser) {
      return;
    }

    const now = performance.now();
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);

    let sumSquares = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index] ?? 0;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    const aboveThreshold = rms >= HOT_MIC_THRESHOLD;

    if (this.processingUtterance) {
      this.rafId = window.requestAnimationFrame(this.tick);
      return;
    }

    if (this.suppressed) {
      this.setState("suppressed");
      this.rafId = window.requestAnimationFrame(this.tick);
      return;
    }

    if (now < this.cooldownUntil) {
      this.setState("cooldown");
      this.rafId = window.requestAnimationFrame(this.tick);
      return;
    }

    if (aboveThreshold) {
      this.silenceDetectedAt = null;
      this.speechDetectedAt ??= now;

      if (!this.segment && now - this.speechDetectedAt >= HOT_MIC_START_MS) {
        this.beginUtterance(now);
      } else if (this.segment) {
        this.setState("capturing");
      }
    } else {
      this.speechDetectedAt = null;

      if (this.segment) {
        this.silenceDetectedAt ??= now;
        this.setState("waiting_for_end_silence");

        if (now - this.silenceDetectedAt >= HOT_MIC_END_SILENCE_MS) {
          void this.finishUtterance(now);
        }
      } else {
        this.setState("armed");
      }
    }

    this.rafId = window.requestAnimationFrame(this.tick);
  };

  private beginUtterance(now: number): void {
    if (!this.stream || this.segment) {
      return;
    }

    this.segment = createRecorderSegment(this.stream);
    this.segment.recorder.start();
    this.utteranceStartedAt = now;
    this.silenceDetectedAt = null;
    this.setState("capturing");
    this.callbacks?.onSpeechStart?.();
  }

  private async finishUtterance(now: number): Promise<void> {
    const utteranceDuration = this.utteranceStartedAt ? now - this.utteranceStartedAt : 0;
    this.processingUtterance = true;
    const audio = await stopRecorderSegment(this.segment);
    this.segment = null;
    this.processingUtterance = false;
    this.utteranceStartedAt = null;
    this.silenceDetectedAt = null;
    this.speechDetectedAt = null;
    this.cooldownUntil = performance.now() + HOT_MIC_COOLDOWN_MS;
    this.setState("cooldown");

    if (utteranceDuration < HOT_MIC_MIN_UTTERANCE_MS || audio.byteLength === 0) {
      return;
    }

    await this.callbacks?.onUtterance(audio);
  }

  private setState(state: HotMicMonitorState): void {
    if (this.state === state) {
      return;
    }

    this.state = state;
    this.callbacks?.onStateChange?.(state);
  }
}
