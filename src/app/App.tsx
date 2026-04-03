import { useEffect, useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { MenuWindow } from "../components/MenuWindow";
import { SettingsPanel } from "../components/SettingsPanel";
import { StagePanel } from "../components/StagePanel";
import { SystemPanel } from "../components/SystemPanel";
import { useCadenceController } from "../hooks/useCadenceController";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { RuntimeInfo } from "../shared/runtime-info";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceBackendProvider } from "../shared/voice-backend";

export function App() {
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [systemOpen, setSystemOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    activeState,
    backendConfig,
    configured,
    connectionReady,
    inputText,
    isRecording,
    metrics,
    mode,
    textBackend,
    ttsProvider,
    voiceBackend,
    setInputText,
    setMode,
    setTextBackend,
    setTtsProvider,
    setVoiceBackend,
    startRecording,
    statusCopy,
    stopRecording,
    submitText,
    topology,
    turns
  } = useCadenceController();

  useEffect(() => {
    if (!window.cadence?.getRuntimeInfo) {
      return;
    }

    void window.cadence.getRuntimeInfo().then(setRuntimeInfo);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSystemOpen(false);
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">Cadence</p>
        </div>
        <div className="topbar-actions">
          <div className="runtime-pill">
            <span>{connectionReady ? "Live" : "Standby"}</span>
            <span>{mode === "voice" ? "Voice" : "Text-only"}</span>
          </div>
          <div className="menu-actions">
            <button type="button" className="menu-button" onClick={() => setSystemOpen(true)}>
              System
            </button>
            <button type="button" className="menu-button" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
          </div>
          <div className="runtime-pill">
            <span>{runtimeInfo ? `Electron ${runtimeInfo.electronVersion}` : "Electron pending"}</span>
            <span>{runtimeInfo ? runtimeInfo.platform : "platform pending"}</span>
          </div>
        </div>
      </header>

      <section className="workspace-grid">
        <StagePanel activeState={activeState} />
        <ChatPanel
          configured={configured}
          connectionReady={connectionReady}
          inputText={inputText}
          isRecording={isRecording}
          mode={mode}
          statusCopy={statusCopy}
          ttsProvider={ttsProvider}
          turns={turns}
          voiceBackend={voiceBackend}
          setInputText={setInputText}
          startRecording={startRecording}
          stopRecording={stopRecording}
          submitText={submitText}
        />
      </section>

      {systemOpen ? (
        <MenuWindow
          title="System"
          subtitle="Timing, transport posture, and runtime details"
          onClose={() => setSystemOpen(false)}
        >
          <SystemPanel
            backendConfig={backendConfig}
            metrics={metrics}
            runtimeInfo={runtimeInfo}
            statusCopy={statusCopy}
            topology={topology}
          />
        </MenuWindow>
      ) : null}

      {settingsOpen ? (
        <MenuWindow
          title="Settings"
          subtitle="Mode selection and backend configuration"
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPanel
            backendConfig={backendConfig}
            mode={mode}
            textBackend={textBackend}
            ttsProvider={ttsProvider}
            voiceBackend={voiceBackend}
            setMode={setMode}
            setTextBackend={setTextBackend as (mode: TextBackendProvider) => void}
            setTtsProvider={setTtsProvider as (provider: TtsProvider) => void}
            setVoiceBackend={setVoiceBackend as (mode: VoiceBackendProvider) => void}
          />
        </MenuWindow>
      ) : null}
    </main>
  );
}
