import type { AvatarPerformanceSnapshot } from "../../shared/performance-directive";

export function timestampNow(): string {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function estimateUserReadMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(320 + words * 70, 360, 1200);
}

export function estimateAssistantDeliveryMs(
  text: string,
  pace: AvatarPerformanceSnapshot["pace"]
): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const basePerWord =
    pace === "animated" ? 150 : pace === "calm" ? 220 : 185;

  return clamp(1100 + words * basePerWord, 1600, 7000);
}

export function estimateAssistantReadMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(900 + words * 95, 1200, 4200);
}
