import type {
  AssistantPerformanceDirective,
  AvatarPerformanceSnapshot
} from "../../shared/performance-directive";

export function snapshotFromDirective(
  directive: AssistantPerformanceDirective,
  previous?: AvatarPerformanceSnapshot,
  options?: {
    retriggerGesture?: boolean;
  }
): AvatarPerformanceSnapshot {
  const shouldRetrigger =
    directive.gesture !== "none" &&
    (options?.retriggerGesture || previous?.gesture !== directive.gesture);

  return {
    ...directive,
    gestureRevision: shouldRetrigger
      ? (previous?.gestureRevision ?? 0) + 1
      : previous?.gestureRevision ?? 0
  };
}
