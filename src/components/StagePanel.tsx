import type { AvatarSelection } from "../shared/app-settings";
import type { AssistantStateSnapshot } from "../shared/assistant-state";
import type { AvatarPerformanceSnapshot } from "../shared/performance-directive";
import type { StageMode } from "../shared/stage-mode";
import { VrmStage } from "./VrmStage";
import { WaveformStage } from "./WaveformStage";

type StagePanelProps = {
  activeState: AssistantStateSnapshot;
  avatar: AvatarSelection | null;
  avatarPoseDebug: boolean;
  performance: AvatarPerformanceSnapshot;
  stageMode: StageMode;
};

export function StagePanel({
  activeState,
  avatar,
  avatarPoseDebug,
  performance,
  stageMode
}: StagePanelProps) {
  const stageLabel =
    stageMode === "waveform"
      ? "Waveform"
      : avatar?.label.replace(/\.vrm$/i, "") ?? "No avatar";

  return (
    <section className={`panel stage stage-state-${activeState.type}`}>
      <div className="stage-header">
        <p className="eyebrow">Stage</p>
        <div className="state-chip">{activeState.badge}</div>
      </div>

      <div className="stage-canvas">
        {stageMode === "waveform" ? (
          <WaveformStage activeState={activeState} />
        ) : (
          <VrmStage
            activeState={activeState}
            avatar={avatar}
            debugPose={avatarPoseDebug}
            performance={performance}
          />
        )}

        <div className="stage-status">
          <strong>{stageLabel}</strong>
          <span>{activeState.detail}</span>
        </div>
      </div>
    </section>
  );
}
