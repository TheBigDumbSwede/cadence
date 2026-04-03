import type { AssistantStateSnapshot } from "../shared/assistant-state";

type StagePanelProps = {
  activeState: AssistantStateSnapshot;
};

export function StagePanel({ activeState }: StagePanelProps) {
  return (
    <section className={`panel stage stage-state-${activeState.type}`}>
      <div className="stage-header">
        <p className="eyebrow">Stage</p>
        <div className="state-chip">{activeState.badge}</div>
      </div>

      <div className="stage-canvas">
        <div className="stage-ring" />
        <div className="stage-aura" />
        <div className="stage-core" />

        <div className="stage-copy">
          <p className="eyebrow">Current State</p>
          <h2>{activeState.title}</h2>
          <p>{activeState.detail}</p>
        </div>
      </div>
    </section>
  );
}
