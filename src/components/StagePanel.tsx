import type { AvatarSelection } from "../shared/app-settings";
import type { AssistantStateSnapshot } from "../shared/assistant-state";
import type { AvatarPerformanceSnapshot } from "../shared/performance-directive";
import { VrmStage } from "./VrmStage";

type StagePanelProps = {
  activeState: AssistantStateSnapshot;
  avatar: AvatarSelection | null;
  avatarPoseDebug: boolean;
  performance: AvatarPerformanceSnapshot;
};

export function StagePanel({
  activeState,
  avatar,
  avatarPoseDebug,
  performance
}: StagePanelProps) {
  const avatarName = avatar?.label.replace(/\.vrm$/i, "") ?? "No avatar";

  return (
    <section className={`panel stage stage-state-${activeState.type}`}>
      <div className="stage-header">
        <p className="eyebrow">Stage</p>
        <div className="state-chip">{activeState.badge}</div>
      </div>

      <div className="stage-canvas">
        <VrmStage
          activeState={activeState}
          avatar={avatar}
          debugPose={avatarPoseDebug}
          performance={performance}
        />

        <div className="stage-status">
          <strong>{avatarName}</strong>
          <span>{activeState.detail}</span>
        </div>
      </div>
    </section>
  );
}
