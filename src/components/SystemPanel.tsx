import { voiceStackNotes } from "../services/transportOptions";
import type { BackendConfigSummary } from "../shared/backend-config";
import type { ConversationMetrics } from "../shared/conversation-types";
import type { RuntimeInfo } from "../shared/runtime-info";

type SystemPanelProps = {
  backendConfig: BackendConfigSummary;
  onOpenMemoryManager: () => void;
  lastMemoryIngest: {
    provider: string;
    written: number;
    updated: number;
    ignored: number;
  } | null;
  lastMemoryRecall: {
    provider: string;
    contextBlock: string;
  } | null;
  metrics: ConversationMetrics;
  runtimeInfo: RuntimeInfo | null;
  statusCopy: string;
  topology: {
    transport: string;
    transcript: string;
    speech: string;
    reasoning: string;
  };
};

export function SystemPanel({
  backendConfig,
  onOpenMemoryManager,
  lastMemoryIngest,
  lastMemoryRecall,
  metrics,
  runtimeInfo,
  statusCopy,
  topology
}: SystemPanelProps) {
  return (
    <div className="menu-stack">
      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Live System</p>
            <h3 className="panel-title">Status and timing</h3>
          </div>
        </div>
        <div className="settings-grid metrics-grid">
          <article className="metric-card">
            <p className="metric-label">Session status</p>
            <span className="metric-value metric-value-copy">{statusCopy}</span>
          </article>
          <article className="metric-card">
            <p className="metric-label">Time to listening</p>
            <span className="metric-value">{metrics.timeToListeningMs} ms</span>
          </article>
          <article className="metric-card">
            <p className="metric-label">First response audio</p>
            <span className="metric-value">{metrics.timeToFirstSpeechMs} ms</span>
          </article>
          <article className="metric-card">
            <p className="metric-label">Interrupt recovery</p>
            <span className="metric-value">{metrics.interruptRecoveryMs} ms</span>
          </article>
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Architecture</p>
            <h3 className="panel-title">Boundaries</h3>
          </div>
        </div>
        <div className="settings-grid">
          <article className="setting-card">
            <strong>Transport</strong>
            <p className="setting-copy">{topology.transport}</p>
          </article>
          <article className="setting-card">
            <strong>Transcript</strong>
            <p className="setting-copy">{topology.transcript}</p>
          </article>
          <article className="setting-card">
            <strong>Speech</strong>
            <p className="setting-copy">{topology.speech}</p>
          </article>
          <article className="setting-card">
            <strong>Reasoning</strong>
            <p className="setting-copy">{topology.reasoning}</p>
          </article>
          <article className="setting-card">
            <strong>Runtime</strong>
            <p className="setting-copy">
              {runtimeInfo
                ? `Electron ${runtimeInfo.electronVersion} on ${runtimeInfo.platform}, Node ${runtimeInfo.nodeVersion}`
                : "Runtime info pending"}
            </p>
          </article>
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Memory Debug</p>
            <h3 className="panel-title">Last recall</h3>
          </div>
        </div>
        <div className="settings-grid">
          <article className="setting-card">
            <strong>Provider</strong>
            <p className="setting-copy">
              {lastMemoryRecall?.provider ?? "No memory recall yet"}
            </p>
          </article>
          <article className="setting-card">
            <strong>Injected context</strong>
            <p className="setting-copy" style={{ whiteSpace: "pre-wrap" }}>
              {lastMemoryRecall
                ? lastMemoryRecall.contextBlock || "No matching memory."
                : "No memory recall yet."}
            </p>
            <div className="settings-inline-actions">
              <button type="button" className="secondary-button" onClick={onOpenMemoryManager}>
                Manage Memories
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Memory Debug</p>
            <h3 className="panel-title">Last ingest</h3>
          </div>
        </div>
        <div className="settings-grid">
          <article className="setting-card">
            <strong>Provider</strong>
            <p className="setting-copy">
              {lastMemoryIngest?.provider ?? "No memory ingest yet"}
            </p>
          </article>
          <article className="setting-card">
            <strong>Write result</strong>
            <p className="setting-copy">
              {lastMemoryIngest
                ? `written ${lastMemoryIngest.written}, updated ${lastMemoryIngest.updated}, ignored ${lastMemoryIngest.ignored}`
                : "No memory ingest yet."}
            </p>
          </article>
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Notes</p>
            <h3 className="panel-title">Prototype notes</h3>
          </div>
        </div>
        <div className="settings-grid">
          {voiceStackNotes.map((note) => (
            <article key={note.title} className="setting-card">
              <strong>{note.title}</strong>
              <p className="setting-copy">{note.body}</p>
            </article>
          ))}
          <article className="setting-card">
            <strong>Active backend</strong>
            <p className="setting-copy">{backendConfig.providerLabel}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
