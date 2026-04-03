const TARGET_SAMPLE_RATE = 24000;

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

export class PushToTalkRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<void> {
    if (this.recorder?.state === "recording") {
      return;
    }

    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
    }

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
