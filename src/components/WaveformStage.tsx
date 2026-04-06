import { useEffect, useMemo, useState } from "react";
import type { PreviewAssistantStateId } from "../shared/assistant-state";
import type { AssistantStateSnapshot } from "../shared/assistant-state";
import {
  getOutputWaveformSnapshot,
  subscribeToOutputWaveform,
  type OutputWaveformSnapshot
} from "../services/audio/outputWaveformStore";

type WaveformStageProps = {
  activeState: AssistantStateSnapshot;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export function WaveformStage({ activeState }: WaveformStageProps) {
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
  }, [activeState.type, phase, speakingBridgeStartedAt, waveform.active, waveform.level]);

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

  return (
    <div className="waveform-stage-shell">
      <div className="waveform-grid" />
      <div className={`waveform-core waveform-state-${activeState.type}`}>
        <svg
          className="waveform-svg waveform-glow"
          viewBox="0 0 540 540"
          aria-hidden="true"
        >
          <path d={glowPath} />
        </svg>
        <svg className="waveform-svg waveform-aura" viewBox="0 0 540 540" aria-hidden="true">
          <path d={auraPath} />
        </svg>
        <svg className="waveform-svg waveform-core-line" viewBox="0 0 540 540" aria-hidden="true">
          <path d={corePath} />
        </svg>
      </div>
    </div>
  );
}
