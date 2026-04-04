import { useEffect, useState } from "react";
import type {
  AvatarSelection,
  SettingsSnapshot,
  SettingsUpdate
} from "../shared/app-settings";
import type { BackendConfigSummary } from "../shared/backend-config";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { InteractionMode } from "../shared/interaction-mode";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceBackendProvider } from "../shared/voice-backend";

type SettingsPanelProps = {
  avatarPoseDebug: boolean;
  backendConfig: BackendConfigSummary;
  mode: InteractionMode;
  onChooseAvatar: () => Promise<AvatarSelection | null>;
  onSetAvatar: (filePath: string | null) => Promise<void>;
  onSaveSettings: (update: Omit<SettingsUpdate, "preferences">) => Promise<void>;
  settingsFeedback: string;
  settingsLoaded: boolean;
  settingsSaveState: "idle" | "saving" | "saved" | "error";
  settingsSnapshot: SettingsSnapshot | null;
  setAvatarPoseDebug: (enabled: boolean) => void;
  textBackend: TextBackendProvider;
  ttsProvider: TtsProvider;
  voiceBackend: VoiceBackendProvider;
  setMode: (mode: InteractionMode) => void;
  setTextBackend: (provider: TextBackendProvider) => void;
  setTtsProvider: (provider: TtsProvider) => void;
  setVoiceBackend: (provider: VoiceBackendProvider) => void;
};

export function SettingsPanel({
  avatarPoseDebug,
  backendConfig,
  mode,
  onChooseAvatar,
  onSetAvatar,
  onSaveSettings,
  settingsFeedback,
  settingsLoaded,
  settingsSaveState,
  settingsSnapshot,
  setAvatarPoseDebug,
  textBackend,
  ttsProvider,
  voiceBackend,
  setMode,
  setTextBackend,
  setTtsProvider,
  setVoiceBackend
}: SettingsPanelProps) {
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [clearOpenAiApiKey, setClearOpenAiApiKey] = useState(false);
  const [openAiTtsVoice, setOpenAiTtsVoice] = useState("");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const [clearElevenLabsApiKey, setClearElevenLabsApiKey] = useState(false);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState("");
  const [kindroidApiKey, setKindroidApiKey] = useState("");
  const [clearKindroidApiKey, setClearKindroidApiKey] = useState(false);
  const [kindroidAiId, setKindroidAiId] = useState("");
  const [kindroidBaseUrl, setKindroidBaseUrl] = useState("");

  useEffect(() => {
    if (!settingsSnapshot) {
      return;
    }

    setOpenAiApiKey("");
    setClearOpenAiApiKey(false);
    setOpenAiTtsVoice(settingsSnapshot.openAiTtsVoice);
    setElevenLabsApiKey("");
    setClearElevenLabsApiKey(false);
    setElevenLabsVoiceId(settingsSnapshot.elevenLabsVoiceId);
    setKindroidApiKey("");
    setClearKindroidApiKey(false);
    setKindroidAiId(settingsSnapshot.kindroidAiId);
    setKindroidBaseUrl(settingsSnapshot.kindroidBaseUrl);
  }, [settingsSnapshot]);

  const saveDisabled = !settingsLoaded || settingsSaveState === "saving";

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
            <p className="eyebrow">Avatar</p>
            <h3 className="panel-title">Choose the VRM model for the stage</h3>
          </div>
        </div>
        <div className="settings-grid">
          <article className="setting-card">
            <strong>Current avatar</strong>
            <p className="setting-copy">
              {settingsSnapshot?.avatar?.label ?? "No avatar selected."}
            </p>
            <p className="field-status">
              {settingsSnapshot?.avatar?.path ?? "Choose a local .vrm file from disk."}
            </p>
            <div className="settings-inline-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  void onChooseAvatar().then((selection) => {
                    if (!selection) {
                      return;
                    }

                    void onSetAvatar(selection.path);
                  });
                }}
              >
                Choose Avatar...
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!settingsSnapshot?.avatar}
                onClick={() => void onSetAvatar(null)}
              >
                Clear Avatar
              </button>
            </div>
            {settingsSnapshot?.recentAvatars.length ? (
              <div className="settings-chip-list">
                {settingsSnapshot.recentAvatars.map((avatar) => {
                  const isActive = settingsSnapshot.avatar?.path === avatar.path;

                  return (
                    <button
                      key={avatar.path}
                      type="button"
                      className={`secondary-button settings-chip ${isActive ? "active" : ""}`}
                      disabled={isActive}
                      onClick={() => void onSetAvatar(avatar.path)}
                    >
                      {avatar.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </article>
          <article className="setting-card">
            <strong>Pose debug</strong>
            <p className="setting-copy">
              Show arm-chain axes and live rotation readouts on the stage while we tune the idle.
            </p>
            <div className="settings-inline-actions">
              <button
                type="button"
                className={`secondary-button ${avatarPoseDebug ? "active" : ""}`}
                onClick={() => setAvatarPoseDebug(!avatarPoseDebug)}
              >
                {avatarPoseDebug ? "Disable Debug" : "Enable Debug"}
              </button>
            </div>
            <p className="field-status">
              {avatarPoseDebug
                ? "Debug helpers are visible on the stage."
                : "Debug helpers are hidden."}
            </p>
          </article>
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section-header">
          <div>
            <p className="eyebrow">Credentials</p>
            <h3 className="panel-title">Store keys and IDs in your local profile</h3>
          </div>
        </div>

        <div className="settings-form-grid">
          <article className="setting-card">
            <strong>OpenAI</strong>
            <div className="settings-field">
              <label htmlFor="openai-api-key">API key</label>
              <div className="secret-row">
                <input
                  id="openai-api-key"
                  className="settings-input"
                  type="password"
                  autoComplete="off"
                  value={openAiApiKey}
                  placeholder={
                    clearOpenAiApiKey
                      ? "Key will be cleared on save"
                      : settingsSnapshot?.hasOpenAiApiKey
                        ? "Stored locally"
                        : "Paste a new key"
                  }
                  onChange={(event) => {
                    setOpenAiApiKey(event.target.value);
                    setClearOpenAiApiKey(false);
                  }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!settingsSnapshot?.hasOpenAiApiKey && !clearOpenAiApiKey}
                  onClick={() => {
                    setOpenAiApiKey("");
                    setClearOpenAiApiKey(true);
                  }}
                >
                  Clear
                </button>
              </div>
              <p className="field-status">
                {clearOpenAiApiKey
                  ? "Saved OpenAI key will be removed."
                  : settingsSnapshot?.hasOpenAiApiKey
                    ? "OpenAI key is stored locally."
                    : "No OpenAI key is stored."}
              </p>
            </div>
            <div className="settings-field">
              <label htmlFor="openai-tts-voice">TTS voice</label>
              <input
                id="openai-tts-voice"
                className="settings-input"
                type="text"
                value={openAiTtsVoice}
                onChange={(event) => setOpenAiTtsVoice(event.target.value)}
                placeholder="alloy"
              />
            </div>
          </article>

          <article className="setting-card">
            <strong>ElevenLabs</strong>
            <div className="settings-field">
              <label htmlFor="elevenlabs-api-key">API key</label>
              <div className="secret-row">
                <input
                  id="elevenlabs-api-key"
                  className="settings-input"
                  type="password"
                  autoComplete="off"
                  value={elevenLabsApiKey}
                  placeholder={
                    clearElevenLabsApiKey
                      ? "Key will be cleared on save"
                      : settingsSnapshot?.hasElevenLabsApiKey
                        ? "Stored locally"
                        : "Paste a new key"
                  }
                  onChange={(event) => {
                    setElevenLabsApiKey(event.target.value);
                    setClearElevenLabsApiKey(false);
                  }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!settingsSnapshot?.hasElevenLabsApiKey && !clearElevenLabsApiKey}
                  onClick={() => {
                    setElevenLabsApiKey("");
                    setClearElevenLabsApiKey(true);
                  }}
                >
                  Clear
                </button>
              </div>
              <p className="field-status">
                {clearElevenLabsApiKey
                  ? "Saved ElevenLabs key will be removed."
                  : settingsSnapshot?.hasElevenLabsApiKey
                    ? "ElevenLabs key is stored locally."
                    : "No ElevenLabs key is stored."}
              </p>
            </div>
            <div className="settings-field">
              <label htmlFor="elevenlabs-voice-id">Voice ID</label>
              <input
                id="elevenlabs-voice-id"
                className="settings-input"
                type="text"
                value={elevenLabsVoiceId}
                onChange={(event) => setElevenLabsVoiceId(event.target.value)}
                placeholder="Voice ID"
              />
            </div>
          </article>

          <article className="setting-card">
            <strong>Kindroid</strong>
            <div className="settings-field">
              <label htmlFor="kindroid-api-key">API key</label>
              <div className="secret-row">
                <input
                  id="kindroid-api-key"
                  className="settings-input"
                  type="password"
                  autoComplete="off"
                  value={kindroidApiKey}
                  placeholder={
                    clearKindroidApiKey
                      ? "Key will be cleared on save"
                      : settingsSnapshot?.hasKindroidApiKey
                        ? "Stored locally"
                        : "Paste a new key"
                  }
                  onChange={(event) => {
                    setKindroidApiKey(event.target.value);
                    setClearKindroidApiKey(false);
                  }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!settingsSnapshot?.hasKindroidApiKey && !clearKindroidApiKey}
                  onClick={() => {
                    setKindroidApiKey("");
                    setClearKindroidApiKey(true);
                  }}
                >
                  Clear
                </button>
              </div>
              <p className="field-status">
                {clearKindroidApiKey
                  ? "Saved Kindroid key will be removed."
                  : settingsSnapshot?.hasKindroidApiKey
                    ? "Kindroid key is stored locally."
                    : "No Kindroid key is stored."}
              </p>
            </div>
            <div className="settings-field">
              <label htmlFor="kindroid-ai-id">AI ID</label>
              <input
                id="kindroid-ai-id"
                className="settings-input"
                type="text"
                value={kindroidAiId}
                onChange={(event) => setKindroidAiId(event.target.value)}
                placeholder="AI ID"
              />
            </div>
            <div className="settings-field">
              <label htmlFor="kindroid-base-url">Base URL</label>
              <input
                id="kindroid-base-url"
                className="settings-input"
                type="text"
                value={kindroidBaseUrl}
                onChange={(event) => setKindroidBaseUrl(event.target.value)}
                placeholder="https://api.kindroid.ai/v1"
              />
            </div>
          </article>
        </div>

        <div className="settings-toolbar">
          <div className="settings-feedback">
            <strong>{settingsSaveState === "error" ? "Save failed" : "Settings"}</strong>
            <span>
              {settingsFeedback ||
                (settingsSnapshot
                  ? `Secrets are stored using ${settingsSnapshot.secretStorage === "encrypted" ? "OS encryption" : "plain local storage"}.`
                  : "Loading settings...")}
            </span>
          </div>
          <button
            type="button"
            className="menu-button"
            disabled={saveDisabled}
            onClick={() =>
              void onSaveSettings({
                openAiApiKey: openAiApiKey.trim() || undefined,
                openAiTtsVoice,
                elevenLabsApiKey: elevenLabsApiKey.trim() || undefined,
                elevenLabsVoiceId,
                kindroidAiId,
                kindroidApiKey: kindroidApiKey.trim() || undefined,
                kindroidBaseUrl,
                clearOpenAiApiKey,
                clearElevenLabsApiKey,
                clearKindroidApiKey
              })
            }
          >
            {settingsSaveState === "saving" ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </section>

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
