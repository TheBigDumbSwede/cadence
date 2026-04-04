import type { AssistantPerformanceDirective } from "../../shared/performance-directive";
import { DEFAULT_PERFORMANCE_DIRECTIVE } from "../../shared/performance-directive";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function createPerformanceDirective(
  overrides: Partial<AssistantPerformanceDirective> = {}
): AssistantPerformanceDirective {
  return {
    ...DEFAULT_PERFORMANCE_DIRECTIVE,
    ...overrides,
    intensity: clamp01(overrides.intensity ?? DEFAULT_PERFORMANCE_DIRECTIVE.intensity)
  };
}

export function inferPerformanceDirective(text: string): AssistantPerformanceDirective {
  const normalized = text.trim().toLowerCase();
  const exclamationCount = (text.match(/!/g) ?? []).length;
  const hasQuestion = text.includes("?");
  const emphasisBoost = exclamationCount > 0 ? Math.min(0.22, exclamationCount * 0.06) : 0;

  if (!normalized) {
    return createPerformanceDirective();
  }

  if (
    /\b(sorry|apologize|unfortunately|can't|cannot|unable|issue|problem|error|afraid)\b/.test(
      normalized
    )
  ) {
    return createPerformanceDirective({
      mood: "concerned",
      gesture: "small_shrug",
      intensity: 0.34 + emphasisBoost * 0.4,
      pace: "calm",
      source: "heuristic",
      cue: "concerned"
    });
  }

  if (/\b(haha|fun|delightful|cute|amazing|awesome|excited)\b/.test(normalized)) {
    return createPerformanceDirective({
      mood: "playful",
      gesture: "open_hand",
      intensity: 0.56 + emphasisBoost,
      pace: "animated",
      source: "heuristic",
      cue: "playful"
    });
  }

  if (
    /\b(glad|love|great|definitely|absolutely|sounds good|that works|perfect|nice)\b/.test(
      normalized
    )
  ) {
    return createPerformanceDirective({
      mood: "warm",
      gesture: "nod",
      intensity: 0.42 + emphasisBoost,
      pace: exclamationCount ? "animated" : "steady",
      source: "heuristic",
      cue: "warm"
    });
  }

  if (
    /\b(think|consider|depends|likely|probably|maybe|suggest|recommend|tradeoff|because)\b/.test(
      normalized
    ) ||
    hasQuestion
  ) {
    return createPerformanceDirective({
      mood: "focused",
      gesture: "thinking_touch",
      intensity: 0.32,
      pace: "calm",
      source: "heuristic",
      cue: "focused"
    });
  }

  return createPerformanceDirective({
    mood: exclamationCount ? "warm" : "neutral",
    gesture: exclamationCount ? "nod" : "none",
    intensity: 0.3 + emphasisBoost * 0.6,
    pace: exclamationCount ? "steady" : "calm",
    source: "heuristic",
    cue: "neutral"
  });
}
