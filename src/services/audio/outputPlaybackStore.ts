export type OutputPlaybackSnapshot = {
  activeTurnId: string | null;
  startedAtMs: number | null;
  durationMs: number | null;
};

let snapshot: OutputPlaybackSnapshot = {
  activeTurnId: null,
  startedAtMs: null,
  durationMs: null
};

const listeners = new Set<(next: OutputPlaybackSnapshot) => void>();

export function getOutputPlaybackSnapshot(): OutputPlaybackSnapshot {
  return snapshot;
}

export function subscribeToOutputPlayback(
  listener: (next: OutputPlaybackSnapshot) => void
): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function publishOutputPlayback(next: OutputPlaybackSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function resetOutputPlayback(): void {
  publishOutputPlayback({
    activeTurnId: null,
    startedAtMs: null,
    durationMs: null
  });
}
