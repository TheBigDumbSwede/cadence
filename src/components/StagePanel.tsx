import { useEffect, useState } from "react";
import type { AssistantStateSnapshot } from "../shared/assistant-state";
import type { KindroidWaveformAccent } from "../shared/kindroid-participants";
import { WaveformStage } from "./WaveformStage";

type StagePanelProps = {
  activeState: AssistantStateSnapshot;
  effectCaption: string | null;
  speechCaption: {
    speakerLabel?: string;
    text: string;
  } | null;
  waveformTheme: {
    color: string;
    accent: KindroidWaveformAccent;
  } | null;
};

export function StagePanel({
  activeState,
  effectCaption,
  speechCaption,
  waveformTheme
}: StagePanelProps) {
  const [displayedEffectCaption, setDisplayedEffectCaption] = useState(effectCaption);
  const [effectCaptionVisible, setEffectCaptionVisible] = useState(Boolean(effectCaption));

  useEffect(() => {
    if (effectCaption) {
      setDisplayedEffectCaption(effectCaption);
      setEffectCaptionVisible(true);
      return;
    }

    if (!displayedEffectCaption) {
      return;
    }

    setEffectCaptionVisible(false);
    const timer = window.setTimeout(() => {
      setDisplayedEffectCaption(null);
    }, 480);

    return () => window.clearTimeout(timer);
  }, [displayedEffectCaption, effectCaption]);

  return (
    <section className={`panel stage stage-state-${activeState.type}`}>
      <div className="stage-header">
        <p className="eyebrow">Presence</p>
        <div className="state-chip">{activeState.badge}</div>
      </div>

      <div className="stage-canvas">
        <WaveformStage activeState={activeState} theme={waveformTheme} />
        {displayedEffectCaption ? (
          <div
            className={`stage-effect-caption${effectCaptionVisible ? " is-visible" : ""}`}
            aria-live="polite"
          >
            <span>{displayedEffectCaption}</span>
          </div>
        ) : null}
        {speechCaption ? (
          <div className="stage-caption" aria-live="polite">
            {speechCaption.speakerLabel ? <strong>{speechCaption.speakerLabel}</strong> : null}
            <span>{speechCaption.text}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
