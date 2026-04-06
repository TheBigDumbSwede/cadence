import { useEffect, useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { MenuWindow } from "../components/MenuWindow";
import { SettingsPanel } from "../components/SettingsPanel";
import { StagePanel } from "../components/StagePanel";
import { SystemPanel } from "../components/SystemPanel";
import { useCadenceController } from "../hooks/useCadenceController";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { RuntimeInfo } from "../shared/runtime-info";
import type { SettingsUpdate } from "../shared/app-settings";
import type { StageMode } from "../shared/stage-mode";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceInputMode } from "../shared/voice-input-mode";
import type { VoiceBackendProvider } from "../shared/voice-backend";

export function App() {
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [systemOpen, setSystemOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    activeState,
    avatarPoseDebug,
    backendConfig,
    chooseAvatarFile,
    configured,
    connectionReady,
    hotMicMuted,
    inputText,
    isRecording,
    metrics,
    mode,
    performance,
    saveSettings,
    setAvatar,
    setAvatarPoseDebug,
    stageMode,
    settingsFeedback,
    settingsLoaded,
    settingsSaveState,
    settingsSnapshot,
    textBackend,
    ttsProvider,
    voiceBackend,
    voiceInputMode,
    setInputText,
    setMode,
    setStageMode,
    setTextBackend,
    setTtsProvider,
    setHotMicMuted,
    setVoiceInputMode,
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
          <div className="menu-actions">
            <button type="button" className="menu-button" onClick={() => setSystemOpen(true)}>
              System
            </button>
            <button type="button" className="menu-button" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
          </div>
        </div>
      </header>

      <section className="workspace-grid">
        <StagePanel
          activeState={activeState}
          avatar={settingsSnapshot?.avatar ?? null}
          avatarPoseDebug={avatarPoseDebug}
          performance={performance}
          stageMode={stageMode}
        />
        <ChatPanel
          configured={configured}
          connectionReady={connectionReady}
          hotMicMuted={hotMicMuted}
          inputText={inputText}
          isRecording={isRecording}
          mode={mode}
          ttsProvider={ttsProvider}
          turns={turns}
          voiceBackend={voiceBackend}
          voiceInputMode={voiceInputMode}
          setHotMicMuted={setHotMicMuted}
          setInputText={setInputText}
          startRecording={startRecording}
          stopRecording={stopRecording}
          submitText={submitText}
        />
      </section>

      {systemOpen ? (
        <MenuWindow
          title="System"
          subtitle="Runtime, timing, and backend state"
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
          subtitle="Modes, stage, and keys"
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPanel
            backendConfig={backendConfig}
            avatarPoseDebug={avatarPoseDebug}
            onChooseAvatar={chooseAvatarFile}
            onSetAvatar={setAvatar}
            mode={mode}
            onSaveSettings={saveSettings as (update: Omit<SettingsUpdate, "preferences">) => Promise<void>}
            settingsFeedback={settingsFeedback}
            settingsLoaded={settingsLoaded}
            settingsSaveState={settingsSaveState}
            settingsSnapshot={settingsSnapshot}
            setAvatarPoseDebug={setAvatarPoseDebug}
            stageMode={stageMode}
            textBackend={textBackend}
            ttsProvider={ttsProvider}
            voiceBackend={voiceBackend}
            voiceInputMode={voiceInputMode}
            setMode={setMode}
            setStageMode={setStageMode as (mode: StageMode) => void}
            setTextBackend={setTextBackend as (mode: TextBackendProvider) => void}
            setTtsProvider={setTtsProvider as (provider: TtsProvider) => void}
            setVoiceInputMode={setVoiceInputMode as (mode: VoiceInputMode) => void}
            setVoiceBackend={setVoiceBackend as (mode: VoiceBackendProvider) => void}
          />
        </MenuWindow>
      ) : null}
    </main>
  );
}
