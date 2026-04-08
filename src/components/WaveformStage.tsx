import { useEffect, useMemo, useState } from "react";
import type { PreviewAssistantStateId } from "../shared/assistant-state";
import type { AssistantStateSnapshot } from "../shared/assistant-state";
import type { KindroidWaveformAccent } from "../shared/kindroid-participants";
import {
  getOutputWaveformSnapshot,
  subscribeToOutputWaveform,
  type OutputWaveformSnapshot
} from "../services/audio/outputWaveformStore";

type WaveformStageProps = {
  activeState: AssistantStateSnapshot;
  theme: {
    color: string;
    accent: KindroidWaveformAccent;
  } | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "d7955b";
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function mixRgb(
  source: [number, number, number],
  target: [number, number, number],
  ratio: number
): [number, number, number] {
  return [
    Math.round(source[0] * (1 - ratio) + target[0] * ratio),
    Math.round(source[1] * (1 - ratio) + target[1] * ratio),
    Math.round(source[2] * (1 - ratio) + target[2] * ratio)
  ];
}

function toRgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function buildWaveformColors(
  color: string,
  state: PreviewAssistantStateId
): {
  shellBackground: string;
  gridBackground: string;
  glow: string;
  aura: string;
  core: string;
  accent: string;
} {
  const base = hexToRgb(color);
  const white: [number, number, number] = [255, 247, 238];
  const sky: [number, number, number] = [173, 220, 248];
  const gold: [number, number, number] = [244, 208, 142];
  const error: [number, number, number] = [214, 114, 114];

  const stateBase =
    state === "listening"
      ? mixRgb(base, sky, 0.34)
      : state === "thinking" || state === "transcribing"
        ? mixRgb(base, gold, 0.22)
        : state === "error"
          ? mixRgb(base, error, 0.72)
          : base;

  return {
    shellBackground: `radial-gradient(circle at 50% 56%, ${toRgba(stateBase, 0.18)}, transparent 24%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(9, 8, 7, 0.12))`,
    gridBackground: `linear-gradient(${toRgba(white, 0.03)} 1px, transparent 1px) 0 0 / 100% 22px, linear-gradient(90deg, ${toRgba(stateBase, 0.08)} 1px, transparent 1px) 0 0 / 28px 100%`,
    glow: toRgba(stateBase, state === "speaking" ? 0.88 : 0.76),
    aura: toRgba(mixRgb(stateBase, white, 0.38), state === "speaking" ? 0.58 : 0.48),
    core: toRgba(mixRgb(stateBase, white, 0.62), state === "speaking" ? 0.98 : 0.94),
    accent: toRgba(mixRgb(stateBase, white, 0.28), 0.9)
  };
}

function renderAccent(accent: KindroidWaveformAccent, color: string) {
  switch (accent) {
    case "none":
      return null;
    case "chevrons":
      return (
        <svg className="waveform-accent-overlay" viewBox="0 0 540 540" aria-hidden="true">
          <path
            d="M120 270l46-42m-46 42l46 42M420 270l-46-42m46 42l-46 42M270 120l-42 46m42-46l42 46M270 420l-42-46m42 46l42-46"
            style={{ stroke: color }}
          />
        </svg>
      );
    case "spark":
      return (
        <svg className="waveform-accent-overlay" viewBox="0 0 540 540" aria-hidden="true">
          <circle cx="384" cy="140" r="7" style={{ fill: color }} />
          <circle cx="420" cy="172" r="4.5" style={{ fill: color, opacity: 0.76 }} />
          <circle cx="358" cy="178" r="3.5" style={{ fill: color, opacity: 0.62 }} />
        </svg>
      );
    case "brackets":
      return (
        <svg className="waveform-accent-overlay" viewBox="0 0 540 540" aria-hidden="true">
          <path
            d="M148 150h38m-38 0v38M392 150h-38m38 0v38M148 390h38m-38 0v-38M392 390h-38m38 0v-38"
            style={{ stroke: color }}
          />
        </svg>
      );
    case "halo":
    default:
      return (
        <svg className="waveform-accent-overlay" viewBox="0 0 540 540" aria-hidden="true">
          <circle
            cx="270"
            cy="270"
            r="206"
            style={{ stroke: color }}
          />
        </svg>
      );
  }
}

function getWaveProfile(state: PreviewAssistantStateId): {
  amplitude: number;
  speed: number;
  travel: number;
  secondary: number;
} {
  switch (state) {
    case "listening":
      return { amplitude: 1.05, speed: 0.92, travel: 0.72, secondary: 0.38 };
    case "thinking":
      return { amplitude: 1.05, speed: 0.72, travel: 0.65, secondary: 0.38 };
    case "speaking":
      return { amplitude: 1.18, speed: 1.08, travel: 0.82, secondary: 0.46 };
    case "transcribing":
      return { amplitude: 1.05, speed: 0.86, travel: 0.7, secondary: 0.38 };
    case "error":
      return { amplitude: 1.05, speed: 0.48, travel: 0.42, secondary: 0.28 };
    case "idle":
    default:
      return { amplitude: 1.05, speed: 0.6, travel: 0.58, secondary: 0.38 };
  }
}

function createProceduralSamples(
  level: number,
  size: number,
  phase: number,
  state: PreviewAssistantStateId
): number[] {
  const profile = getWaveProfile(state);
  return Array.from({ length: size }, (_, index) => {
    const t = index / Math.max(size - 1, 1);
    const basePhase = t * Math.PI * 2 * (1 + profile.travel);
    const drift =
      Math.sin(basePhase + phase * profile.speed) * level * profile.amplitude;
    const secondary =
      Math.sin(basePhase * 0.5 - phase * (profile.speed * 0.6) + 0.8) *
      level *
      profile.secondary;
    return drift + secondary;
  });
}

function smoothSamples(samples: number[], passes = 2): number[] {
  let next = [...samples];

  for (let pass = 0; pass < passes; pass += 1) {
    next = next.map((sample, index, values) => {
      const previous = values[Math.max(0, index - 1)];
      const current = sample;
      const following = values[Math.min(values.length - 1, index + 1)];
      return previous * 0.25 + current * 0.5 + following * 0.25;
    });
  }

  return next;
}

function buildPoints(
  samples: number[],
  width: number,
  height: number,
  gain: number
): Array<{ x: number; y: number }> {
  const midY = height / 2;
  const usableHeight = height * gain;
  return samples
    .map((sample, index) => {
      const t = index / Math.max(samples.length - 1, 1);
      const centered = t * 2 - 1;
      const curvedX = Math.sin(centered * (Math.PI / 2));
      const x = ((curvedX + 1) / 2) * width;
      const centerWeight = Math.max(0, Math.cos(centered * (Math.PI / 2)));
      const edgeTaper = Math.pow(centerWeight, 4.1);
      const centerLift = 1 + Math.pow(centerWeight, 4.5) * 1.15;
      const y = midY - sample * usableHeight * edgeTaper * centerLift;
      return { x, y };
    });
}

function buildSmoothPath(
  samples: number[],
  width: number,
  height: number,
  gain: number
): string {
  const points = buildPoints(samples, width, height, gain);
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }

  const firstPoint = points[0];
  let path = `M ${firstPoint.x.toFixed(2)} ${firstPoint.y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    if (index === 0) {
      path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
      continue;
    }

    path += ` T ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }

  const lastPoint = points[points.length - 1];
  path += ` T ${lastPoint.x.toFixed(2)} ${lastPoint.y.toFixed(2)}`;
  return path;
}

export function WaveformStage({ activeState, theme }: WaveformStageProps) {
  const [waveform, setWaveform] = useState<OutputWaveformSnapshot>(() =>
    getOutputWaveformSnapshot()
  );
  const [phase, setPhase] = useState(0);
  const [speakingBridgeStartedAt, setSpeakingBridgeStartedAt] = useState<number | null>(null);

  useEffect(() => subscribeToOutputWaveform(setWaveform), []);

  useEffect(() => {
    let frameId = 0;

    const tick = (now: number) => {
      setPhase(now / 1000);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (activeState.type === "speaking") {
      setSpeakingBridgeStartedAt((previous) => previous ?? performance.now());
      return;
    }

    setSpeakingBridgeStartedAt(null);
  }, [activeState.type]);

  const displayLevel = useMemo(() => {
    if (waveform.active) {
      return waveform.level;
    }

    if (
      activeState.type === "idle" ||
      activeState.type === "listening" ||
      activeState.type === "thinking" ||
      activeState.type === "speaking" ||
      activeState.type === "transcribing" ||
      activeState.type === "error"
    ) {
      if (activeState.type === "speaking") {
        const bridgeAgeMs =
          speakingBridgeStartedAt === null ? 0 : performance.now() - speakingBridgeStartedAt;
        const bridgeAttack = clamp(bridgeAgeMs / 180, 0, 1);
        return 0.14 + bridgeAttack * 0.16;
      }

      return 0.08;
    }

    return 0.08;
  }, [activeState.type, speakingBridgeStartedAt, waveform.active, waveform.level]);

  const samples = useMemo(() => {
    if (waveform.active && waveform.samples.some((sample) => Math.abs(sample) > 0.002)) {
      return smoothSamples(
        waveform.samples.map((sample) => clamp(sample * 3.8, -1, 1)),
        3
      );
    }

    return smoothSamples(
      createProceduralSamples(displayLevel, 48, phase, activeState.type),
      2
    );
  }, [activeState.type, displayLevel, phase, waveform.active, waveform.samples]);

  const glowPath = useMemo(() => buildSmoothPath(samples, 540, 540, 0.3), [samples]);
  const auraPath = useMemo(() => buildSmoothPath(samples, 540, 540, 0.26), [samples]);
  const corePath = useMemo(() => buildSmoothPath(samples, 540, 540, 0.22), [samples]);
  const waveformColors = useMemo(
    () => buildWaveformColors(theme?.color ?? "#d7955b", activeState.type),
    [activeState.type, theme?.color]
  );

  return (
    <div
      className="waveform-stage-shell"
      style={{ background: waveformColors.shellBackground }}
    >
      <div className="waveform-grid" style={{ background: waveformColors.gridBackground }} />
      <div className={`waveform-core waveform-state-${activeState.type}`}>
        <svg
          className="waveform-svg waveform-glow"
          viewBox="0 0 540 540"
          aria-hidden="true"
        >
          <path d={glowPath} style={{ stroke: waveformColors.glow }} />
        </svg>
        <svg className="waveform-svg waveform-aura" viewBox="0 0 540 540" aria-hidden="true">
          <path d={auraPath} style={{ stroke: waveformColors.aura }} />
        </svg>
        <svg className="waveform-svg waveform-core-line" viewBox="0 0 540 540" aria-hidden="true">
          <path d={corePath} style={{ stroke: waveformColors.core }} />
        </svg>
        {renderAccent(theme?.accent ?? "none", waveformColors.accent)}
      </div>
    </div>
  );
}
