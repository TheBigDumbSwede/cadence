export type OutputWaveformSnapshot = {
  active: boolean;
  level: number;
  samples: number[];
};

const SAMPLE_COUNT = 48;

const zeroSamples = Array.from({ length: SAMPLE_COUNT }, () => 0);

let snapshot: OutputWaveformSnapshot = {
  active: false,
  level: 0,
  samples: zeroSamples
};

const listeners = new Set<(next: OutputWaveformSnapshot) => void>();

export function getOutputWaveformSnapshot(): OutputWaveformSnapshot {
  return snapshot;
}

export function subscribeToOutputWaveform(
  listener: (next: OutputWaveformSnapshot) => void
): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function publishOutputWaveform(next: OutputWaveformSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function resetOutputWaveform(): void {
  publishOutputWaveform({
    active: false,
    level: 0,
    samples: zeroSamples
  });
}
