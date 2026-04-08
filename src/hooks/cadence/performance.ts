import type { PresenceDirective, PresenceSnapshot } from "../../shared/performance-directive";

export function snapshotFromDirective(
  directive: PresenceDirective,
  previous?: PresenceSnapshot,
  options?: {
    retriggerGesture?: boolean;
  }
): PresenceSnapshot {
  const shouldRetrigger =
    directive.gesture !== "none" &&
    (options?.retriggerGesture || previous?.gesture !== directive.gesture);

  return {
    ...directive,
    gestureRevision: shouldRetrigger
      ? (previous?.gestureRevision ?? 0) + 1
      : (previous?.gestureRevision ?? 0)
  };
}
