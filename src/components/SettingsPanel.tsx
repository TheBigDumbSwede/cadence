import type { BackendConfigSummary } from "../shared/backend-config";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { InteractionMode } from "../shared/interaction-mode";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceBackendProvider } from "../shared/voice-backend";

type SettingsPanelProps = {
  backendConfig: BackendConfigSummary;
  mode: InteractionMode;
  textBackend: TextBackendProvider;
  ttsProvider: TtsProvider;
  voiceBackend: VoiceBackendProvider;
  setMode: (mode: InteractionMode) => void;
  setTextBackend: (provider: TextBackendProvider) => void;
  setTtsProvider: (provider: TtsProvider) => void;
  setVoiceBackend: (provider: VoiceBackendProvider) => void;
};

export function SettingsPanel({
  backendConfig,
  mode,
  textBackend,
  ttsProvider,
  voiceBackend,
  setMode,
  setTextBackend,
  setTtsProvider,
  setVoiceBackend
}: SettingsPanelProps) {
  return (
    <div className="menu-stack">
      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Interaction</p>
            <h3 className="panel-title">Choose how Cadence should listen and answer</h3>
          </div>
        </div>
        <div className="mode-switch">
          <button
            type="button"
            className={`preview-button ${mode === "voice" ? "active" : ""}`}
            onClick={() => setMode("voice")}
          >
            <strong>Voice</strong>
            <span>Push-to-talk with live spoken or text replies.</span>
          </button>
          <button
            type="button"
            className={`preview-button ${mode === "text" ? "active" : ""}`}
            onClick={() => setMode("text")}
          >
            <strong>Text-only</strong>
            <span>Cheaper iteration path through typed turns.</span>
          </button>
        </div>
      </section>

      {mode === "voice" ? (
        <section className="menu-section">
          <div className="menu-section-header">
            <div>
              <p className="eyebrow">Voice Backend</p>
              <h3 className="panel-title">Pick the live conversation path</h3>
            </div>
          </div>
          <div className="mode-switch">
            <button
              type="button"
              className={`preview-button ${voiceBackend === "openai" ? "active" : ""}`}
              onClick={() => setVoiceBackend("openai")}
            >
              <strong>OpenAI Realtime</strong>
              <span>Native low-latency speech path.</span>
            </button>
            <button
              type="button"
              className={`preview-button ${voiceBackend === "kindroid" ? "active" : ""}`}
              onClick={() => setVoiceBackend("kindroid")}
            >
              <strong>Kindroid Voice</strong>
              <span>OpenAI STT, Kindroid character reply, selectable output.</span>
            </button>
          </div>
        </section>
      ) : null}

      {mode === "voice" && voiceBackend === "kindroid" ? (
        <section className="menu-section">
          <div className="menu-section-header">
            <div>
              <p className="eyebrow">Output Layer</p>
              <h3 className="panel-title">Choose how Kindroid responses should leave the app</h3>
            </div>
          </div>
          <div className="mode-switch mode-switch-triple">
            <button
              type="button"
              className={`preview-button ${ttsProvider === "none" ? "active" : ""}`}
              onClick={() => setTtsProvider("none")}
            >
              <strong>Text Reply</strong>
              <span>Voice in, text out.</span>
            </button>
            <button
              type="button"
              className={`preview-button ${ttsProvider === "elevenlabs" ? "active" : ""}`}
              onClick={() => setTtsProvider("elevenlabs")}
            >
              <strong>ElevenLabs Voice</strong>
              <span>Character-forward speech output.</span>
            </button>
            <button
              type="button"
              className={`preview-button ${ttsProvider === "openai" ? "active" : ""}`}
              onClick={() => setTtsProvider("openai")}
            >
              <strong>OpenAI Voice</strong>
              <span>Simpler single-vendor speech path.</span>
            </button>
          </div>
        </section>
      ) : null}

      {mode === "text" ? (
        <section className="menu-section">
          <div className="menu-section-header">
            <div>
              <p className="eyebrow">Text Backend</p>
              <h3 className="panel-title">Pick the text conversation engine</h3>
            </div>
          </div>
          <div className="mode-switch">
            <button
              type="button"
              className={`preview-button ${textBackend === "openai" ? "active" : ""}`}
              onClick={() => setTextBackend("openai")}
            >
              <strong>OpenAI Text</strong>
              <span>Cheap general-purpose development path.</span>
            </button>
            <button
              type="button"
              className={`preview-button ${textBackend === "kindroid" ? "active" : ""}`}
              onClick={() => setTextBackend("kindroid")}
            >
              <strong>Kindroid</strong>
              <span>Character backend using your Kindroid AI ID.</span>
            </button>
          </div>
        </section>
      ) : null}

      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Configuration</p>
            <h3 className="panel-title">{backendConfig.providerLabel}</h3>
          </div>
        </div>
        <div className="settings-grid">
          <article className="setting-card">
            <strong>Active config</strong>
            <p className="setting-copy">
              {backendConfig.configured
                ? "Required configuration appears present."
                : "Configuration is incomplete for the active backend."}
            </p>
          </article>
          {backendConfig.items.map((item) => (
            <article key={item.label} className="setting-card">
              <strong>{item.label}</strong>
              <p className="setting-copy">{item.present ? item.value ?? "Present" : "Missing"}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
