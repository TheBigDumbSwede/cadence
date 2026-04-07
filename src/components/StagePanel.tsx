import type { AvatarSelection } from "../shared/app-settings";
import type { AssistantStateSnapshot } from "../shared/assistant-state";
import type { AvatarPerformanceSnapshot } from "../shared/performance-directive";
import type { KindroidWaveformAccent } from "../shared/kindroid-participants";
import type { StageMode } from "../shared/stage-mode";
import { VrmStage } from "./VrmStage";
import { WaveformStage } from "./WaveformStage";

type StagePanelProps = {
  activeState: AssistantStateSnapshot;
  avatar: AvatarSelection | null;
  avatarPoseDebug: boolean;
  performance: AvatarPerformanceSnapshot;
  speechCaption: {
    speakerLabel?: string;
    text: string;
  } | null;
  stageMode: StageMode;
  waveformTheme: {
    color: string;
    accent: KindroidWaveformAccent;
  } | null;
};

export function StagePanel({
  activeState,
  avatar,
  avatarPoseDebug,
  performance,
  speechCaption,
  stageMode,
  waveformTheme
}: StagePanelProps) {
  return (
    <section className={`panel stage stage-state-${activeState.type}`}>
      <div className="stage-header">
        <p className="eyebrow">Stage</p>
        <div className="state-chip">{activeState.badge}</div>
      </div>

      <div className="stage-canvas">
        {stageMode === "waveform" ? (
          <WaveformStage activeState={activeState} theme={waveformTheme} />
        ) : (
          <VrmStage
            activeState={activeState}
            avatar={avatar}
            debugPose={avatarPoseDebug}
            performance={performance}
          />
        )}
        {speechCaption ? (
          <div className="stage-caption" aria-live="polite">
            {speechCaption.speakerLabel ? (
              <strong>{speechCaption.speakerLabel}</strong>
            ) : null}
            <span>{speechCaption.text}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
