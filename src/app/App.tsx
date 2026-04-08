import { useEffect, useState } from "react";
import type { SettingsUpdate } from "../shared/app-settings";
import { ChatBreakDialog } from "../components/ChatBreakDialog";
import { ChatPanel } from "../components/ChatPanel";
import { KindroidPanel } from "../components/KindroidPanel";
import { MenuWindow } from "../components/MenuWindow";
import { SettingsPanel } from "../components/SettingsPanel";
import { StagePanel } from "../components/StagePanel";
import { SystemPanel } from "../components/SystemPanel";
import { useCadenceController } from "../hooks/useCadenceController";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { RuntimeInfo } from "../shared/runtime-info";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceInputMode } from "../shared/voice-input-mode";
import type { VoiceBackendProvider } from "../shared/voice-backend";

export function App() {
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [chatBreakError, setChatBreakError] = useState("");
  const [chatBreakGreeting, setChatBreakGreeting] = useState("");
  const [chatBreakOpen, setChatBreakOpen] = useState(false);
  const [kindroidOpen, setKindroidOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    activeKindroidGroupParticipants,
    activeKindroidGroupMirror,
    activeEffectCaption,
    activeKindroidParticipant,
    activeSpeechCaption,
    activeWaveformKindroidParticipant,
    activeState,
    backendConfig,
    newChatPending,
    configured,
    connectionReady,
    composerPlaceholder,
    hotMicMuted,
    inputText,
    isRecording,
    kindroidAutoTurnInProgress,
    kindroidAwaitingUserTurn,
    metrics,
    mode,
    pendingAssistantHint,
    pendingSceneBreakLabel,
    requestKindroidGroupParticipantTurn,
    saveSettings,
    saveKindroidConfig,
    settingsFeedback,
    settingsLoaded,
    settingsSaveState,
    settingsSnapshot,
    textBackend,
    ttsProvider,
    effectiveTtsProvider,
    usesKindroidGroupConversation,
    voiceBackend,
    voiceInputMode,
    setInputText,
    setMode,
    setTextBackend,
    setTtsProvider,
    setHotMicMuted,
    setVoiceInputMode,
    setVoiceBackend,
    startRecording,
    startNewChat,
    statusCopy,
    stopRecording,
    submitText,
    takeBackKindroidGroupTurn,
    topology,
    turns
  } = useCadenceController();
  const kindroidBackendActive =
    (mode === "voice" && voiceBackend === "kindroid") ||
    (mode === "text" && textBackend === "kindroid");

  useEffect(() => {
    if (!window.cadence?.getRuntimeInfo) {
      return;
    }

    void window.cadence.getRuntimeInfo().then(setRuntimeInfo);
  }, []);

  useEffect(() => {
    if (chatBreakOpen) {
      return;
    }

    setChatBreakGreeting(settingsSnapshot?.kindroidGreeting ?? "");
    setChatBreakError("");
  }, [chatBreakOpen, settingsSnapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!newChatPending) {
          setChatBreakOpen(false);
        }
        setKindroidOpen(false);
        setSystemOpen(false);
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [newChatPending]);

  const canStartChatBreak =
    !usesKindroidGroupConversation &&
    ((mode === "voice" && voiceBackend === "kindroid") ||
      (mode === "text" && textBackend === "kindroid"));
  const kindroidMenuVisible =
    (mode === "voice" && voiceBackend === "kindroid") ||
    (mode === "text" && textBackend === "kindroid");

  function openChatBreakDialog(): void {
    setChatBreakGreeting(settingsSnapshot?.kindroidGreeting ?? "");
    setChatBreakError("");
    setChatBreakOpen(true);
  }

  async function confirmChatBreak(): Promise<void> {
    try {
      await startNewChat(chatBreakGreeting);
      setChatBreakOpen(false);
      setChatBreakError("");
    } catch (error) {
      setChatBreakError(
        error instanceof Error ? error.message : "Failed to run the chat break."
      );
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">Cadence</p>
        </div>
        <div className="topbar-actions">
          <div className="menu-actions">
            {kindroidMenuVisible ? (
              <button type="button" className="menu-button" onClick={() => setKindroidOpen(true)}>
                Kindroid
              </button>
            ) : null}
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
          effectCaption={kindroidBackendActive ? activeEffectCaption : null}
          speechCaption={kindroidBackendActive ? activeSpeechCaption : null}
          waveformTheme={
            activeWaveformKindroidParticipant
              ? {
                  color: activeWaveformKindroidParticipant.waveformColor,
                  accent: activeWaveformKindroidParticipant.waveformAccent
                }
              : null
          }
        />
        <ChatPanel
          canStartNewChat={canStartChatBreak}
          configured={configured}
          connectionReady={connectionReady}
          composerPlaceholder={composerPlaceholder}
          conversationSummaryOverride={
            usesKindroidGroupConversation && kindroidBackendActive
              ? mode === "voice"
                ? "Kindroid Group Voice"
                : "Kindroid Group"
              : undefined
          }
          hotMicMuted={hotMicMuted}
          inputText={inputText}
          isRecording={isRecording}
          kindroidManualTurnTaking={
            usesKindroidGroupConversation && kindroidBackendActive
              ? activeKindroidGroupMirror?.manualTurnTaking ?? false
              : false
          }
          kindroidGroupAwaitingUserTurn={
            usesKindroidGroupConversation && kindroidBackendActive
              ? kindroidAwaitingUserTurn
              : false
          }
          kindroidGroupParticipants={
            usesKindroidGroupConversation && kindroidBackendActive
              ? activeKindroidGroupParticipants.map((participant) => ({
                  id: participant.id,
                  label: participant.bubbleName
                }))
              : []
          }
          kindroidShowTakeTurnBack={
            usesKindroidGroupConversation && kindroidBackendActive
              ? kindroidAutoTurnInProgress
              : false
          }
          mode={mode}
          newChatPending={newChatPending}
          openChatBreakDialog={openChatBreakDialog}
          onRequestKindroidGroupParticipantTurn={requestKindroidGroupParticipantTurn}
          onTakeKindroidGroupTurnBack={takeBackKindroidGroupTurn}
          pendingAssistantHint={pendingAssistantHint}
          pendingSceneBreakLabel={pendingSceneBreakLabel}
          transcriptDelimiterByParticipantId={
            settingsSnapshot
              ? Object.fromEntries(
                  settingsSnapshot.kindroidParticipants.map((participant) => [
                    participant.id,
                    participant.narrationDelimiter || "*"
                  ])
                )
              : undefined
          }
          textBackend={textBackend}
          ttsProvider={effectiveTtsProvider}
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

      {kindroidOpen ? (
        <MenuWindow
          title="Kindroid"
          subtitle={
            usesKindroidGroupConversation && activeKindroidGroupMirror
              ? `Active group: ${activeKindroidGroupMirror.displayName}`
              : activeKindroidParticipant
                ? `Active participant: ${activeKindroidParticipant.displayName}`
                : "Participant roster, groups, and routing"
          }
          onClose={() => setKindroidOpen(false)}
        >
          <KindroidPanel
            settingsFeedback={settingsFeedback}
            settingsLoaded={settingsLoaded}
            settingsSaveState={settingsSaveState}
            settingsSnapshot={settingsSnapshot}
            onSaveKindroidConfig={saveKindroidConfig}
          />
        </MenuWindow>
      ) : null}

      {settingsOpen ? (
        <MenuWindow
          title="Settings"
          subtitle="Modes and keys"
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPanel
            backendConfig={backendConfig}
            mode={mode}
            onSaveSettings={saveSettings as (update: Omit<SettingsUpdate, "preferences">) => Promise<void>}
            settingsFeedback={settingsFeedback}
            settingsLoaded={settingsLoaded}
            settingsSaveState={settingsSaveState}
            settingsSnapshot={settingsSnapshot}
            textBackend={textBackend}
            ttsProvider={ttsProvider}
            voiceBackend={voiceBackend}
            voiceInputMode={voiceInputMode}
            setMode={setMode}
            setTextBackend={setTextBackend as (mode: TextBackendProvider) => void}
            setTtsProvider={setTtsProvider as (provider: TtsProvider) => void}
            setVoiceInputMode={setVoiceInputMode as (mode: VoiceInputMode) => void}
            setVoiceBackend={setVoiceBackend as (mode: VoiceBackendProvider) => void}
          />
        </MenuWindow>
      ) : null}

      {chatBreakOpen ? (
        <ChatBreakDialog
          error={chatBreakError}
          greeting={chatBreakGreeting}
          pending={newChatPending}
          onChangeGreeting={setChatBreakGreeting}
          onClose={() => {
            if (!newChatPending) {
              setChatBreakOpen(false);
              setChatBreakError("");
            }
          }}
          onConfirm={() => void confirmChatBreak()}
        />
      ) : null}
    </main>
  );
}
