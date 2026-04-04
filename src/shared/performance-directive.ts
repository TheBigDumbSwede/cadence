export type PerformanceMood = "neutral" | "warm" | "playful" | "concerned" | "focused";

export type PerformanceGesture =
  | "none"
  | "nod"
  | "open_hand"
  | "small_shrug"
  | "thinking_touch";

export type PerformancePace = "calm" | "steady" | "animated";

export type AssistantPerformanceDirective = {
  mood: PerformanceMood;
  gesture: PerformanceGesture;
  intensity: number;
  pace: PerformancePace;
  source: "default" | "heuristic" | "model";
  cue: string;
};

export type AvatarPerformanceSnapshot = AssistantPerformanceDirective & {
  gestureRevision: number;
};

export const DEFAULT_PERFORMANCE_DIRECTIVE: AssistantPerformanceDirective = {
  mood: "neutral",
  gesture: "none",
  intensity: 0.28,
  pace: "steady",
  source: "default",
  cue: "neutral"
};
