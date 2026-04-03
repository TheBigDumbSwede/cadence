import type { CadenceSession } from "../services/CadenceSession";
import { voiceStackNotes } from "../services/transportOptions";
import type { BackendConfigSummary } from "../shared/backend-config";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { ConversationTurn } from "../shared/conversation-types";
import type { InteractionMode } from "../shared/interaction-mode";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceBackendProvider } from "../shared/voice-backend";

type SidebarProps = {
  backendConfig: BackendConfigSummary;
  configured: boolean;
  connectionReady: boolean;
  inputText: string;
  isRecording: boolean;
  mode: InteractionMode;
  textBackend: TextBackendProvider;
  ttsProvider: TtsProvider;
  voiceBackend: VoiceBackendProvider;
  setInputText: (value: string) => void;
  setMode: (mode: InteractionMode) => void;
  setTextBackend: (provider: TextBackendProvider) => void;
  setTtsProvider: (provider: TtsProvider) => void;
  setVoiceBackend: (provider: VoiceBackendProvider) => void;
  startRecording: () => Promise<void>;
  statusCopy: string;
  stopRecording: () => Promise<void>;
  submitText: () => Promise<void>;
  topology: ReturnType<CadenceSession["describeTopology"]>;
  turns: ConversationTurn[];
};

export function Sidebar({
  backendConfig,
  configured,
  connectionReady,
  inputText,
  isRecording,
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
}: SidebarProps) {
  return (
    <aside className="panel sidebar">
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">Control Deck</p>
          <h2 className="panel-title">Mode switch, transport status, and transcript</h2>
        </div>
        <div className="state-chip">{connectionReady ? "Live" : "Standby"}</div>
      </div>

      <section className="sidebar-section">
        <div className="mode-switch" role="tablist" aria-label="Interaction mode">
          <button
            type="button"
            className={`preview-button ${mode === "voice" ? "active" : ""}`}
            onClick={() => setMode("voice")}
          >
            <strong>Voice</strong>
            <span>Push-to-talk with spoken responses.</span>
          </button>
          <button
            type="button"
            className={`preview-button ${mode === "text" ? "active" : ""}`}
            onClick={() => setMode("text")}
          >
            <strong>Text-only</strong>
            <span>Cheaper text path for routine iteration.</span>
          </button>
        </div>

        {mode === "voice" ? (
          <div className="mode-switch" role="tablist" aria-label="Voice backend">
            <button
              type="button"
              className={`preview-button ${voiceBackend === "openai" ? "active" : ""}`}
              onClick={() => setVoiceBackend("openai")}
            >
              <strong>OpenAI Realtime</strong>
              <span>Low-latency voice path with native speech in and out.</span>
            </button>
            <button
              type="button"
              className={`preview-button ${voiceBackend === "kindroid" ? "active" : ""}`}
              onClick={() => setVoiceBackend("kindroid")}
            >
              <strong>Kindroid Voice</strong>
              <span>OpenAI STT, Kindroid character replies, selectable speech out.</span>
            </button>
          </div>
        ) : null}

        {mode === "voice" && voiceBackend === "kindroid" ? (
          <div className="mode-switch" role="tablist" aria-label="Kindroid voice output">
            <button
              type="button"
              className={`preview-button ${ttsProvider === "none" ? "active" : ""}`}
              onClick={() => setTtsProvider("none")}
            >
              <strong>Text Reply</strong>
              <span>Keep voice input, but return Kindroid replies as text only.</span>
            </button>
            <button
              type="button"
              className={`preview-button ${ttsProvider === "elevenlabs" ? "active" : ""}`}
              onClick={() => setTtsProvider("elevenlabs")}
            >
              <strong>ElevenLabs Voice</strong>
              <span>Character-forward speech with your configured ElevenLabs voice.</span>
            </button>
            <button
              type="button"
              className={`preview-button ${ttsProvider === "openai" ? "active" : ""}`}
              onClick={() => setTtsProvider("openai")}
            >
              <strong>OpenAI Voice</strong>
              <span>Single-key speech path using OpenAI TTS for simpler setup.</span>
            </button>
          </div>
        ) : null}

        {mode === "text" ? (
          <div className="mode-switch" role="tablist" aria-label="Text backend">
            <button
              type="button"
              className={`preview-button ${textBackend === "openai" ? "active" : ""}`}
              onClick={() => setTextBackend("openai")}
            >
              <strong>OpenAI Text</strong>
              <span>Cheap generic dev path through the Responses API.</span>
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
        ) : null}

        <p className="panel-copy">
          {mode === "voice"
            ? voiceBackend === "kindroid"
              ? `Kindroid Voice is a composed path: OpenAI transcription in, Kindroid generation in the middle, ${
                  ttsProvider === "none"
                    ? "text-only replies"
                    : ttsProvider === "openai"
                      ? "OpenAI speech"
                      : "ElevenLabs speech"
                }.`
              : "Push-to-talk is deliberate here. It is the fastest way to judge whether the exchange itself feels clean before adding more failure modes."
            : textBackend === "kindroid"
              ? "Kindroid is treated as a character backend. Text mode is first; later STT-in and TTS-out can wrap around it."
              : "Text-only mode uses a separate cheaper model path, so you can debug logic and prompting without paying audio rates."}
        </p>

        <div className="settings-grid">
          <article className="setting-card">
            <strong>Realtime status</strong>
            <p className="setting-copy">{statusCopy}</p>
          </article>
          <button
            type="button"
            className={`preview-button ${isRecording ? "active" : ""}`}
            disabled={mode !== "voice" || !configured || !connectionReady}
            onMouseDown={() => void startRecording()}
            onMouseUp={() => void stopRecording()}
            onMouseLeave={() => void stopRecording()}
            onTouchStart={() => void startRecording()}
            onTouchEnd={() => void stopRecording()}
          >
            <strong>
              {mode === "voice"
                ? isRecording
                  ? "Release To Send"
                  : "Hold To Talk"
                : "Voice Disabled"}
            </strong>
            <span>
              {mode === "voice"
                ? voiceBackend === "kindroid"
                  ? configured
                    ? "Mouse or Spacebar."
                    : ttsProvider === "none"
                      ? "Requires OpenAI STT and Kindroid config."
                      : `Requires OpenAI STT, Kindroid, and ${
                          ttsProvider === "openai" ? "OpenAI TTS" : "ElevenLabs"
                        } config.`
                  : configured
                    ? "Mouse or Spacebar."
                    : "Add OPENAI_API_KEY to .env first."
                : "Switch back to Voice mode to use the microphone."}
            </span>
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="settings-grid">
          <article className="setting-card">
            <strong>Voice pipeline</strong>
            <p className="setting-copy">Separate transport, transcript, and speech adapters so barge-in can cancel downstream work without corrupting turn state.</p>
          </article>
          <article className="setting-card">
            <strong>Avatar path</strong>
            <p className="setting-copy">Presence will subscribe to assistant events later; it should not own timing, memory, or transport.</p>
          </article>
          <article className="setting-card">
            <strong>Current transport</strong>
            <p className="setting-copy">{topology.transport}</p>
          </article>
          <article className="setting-card">
            <strong>Swap posture</strong>
            <p className="setting-copy">
              {topology.speech === "embedded in transport"
                ? "Speech is embedded for the prototype, but the session contract already allows a dedicated speech adapter later."
                : topology.speech}
            </p>
          </article>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="settings-grid">
          <article className="setting-card">
            <strong>{backendConfig.providerLabel} config</strong>
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

      <section className="sidebar-section">
        <div className="settings-grid">
          <article className="setting-card">
            <strong>Text fallback</strong>
            <p className="setting-copy">
              {mode === "voice"
                ? voiceBackend === "kindroid"
                  ? `In Kindroid Voice, typed text uses Kindroid for the reply and ${
                      ttsProvider === "none"
                        ? "does not synthesize any audio"
                        : ttsProvider === "openai"
                          ? "OpenAI TTS"
                          : "ElevenLabs"
                    }${ttsProvider === "none" ? "." : " for the spoken output."}`
                  : "In Voice mode this still uses the Realtime session. Switch to Text-only mode if you want the cheaper path."
                : textBackend === "kindroid"
                  ? "This path hits Kindroid's documented send-message API. It is character-backed, and later STT/TTS can wrap around it."
                  : "This is the cheap development path: same transcript UI, no audio token spend."}
            </p>
          </article>
        </div>
        <div className="text-compose">
          <textarea
            className="compose-input"
            placeholder="Type a prompt if you want to test the session without the microphone."
            rows={4}
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
          />
          <button
            type="button"
            className="preview-button"
            disabled={!connectionReady || !inputText.trim()}
            onClick={() => void submitText()}
          >
            <strong>Send Text</strong>
            <span>Kick the same live transport without audio capture.</span>
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="settings-grid">
          {voiceStackNotes.map((note) => (
            <article key={note.title} className="setting-card">
              <strong>{note.title}</strong>
              <p className="setting-copy">{note.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sidebar-section">
        <p className="panel-copy">Conversation transcript stays secondary and collapsible.</p>
        <div className="turn-list">
          {turns.map((turn) => (
            <article key={turn.id} className="turn-card" data-speaker={turn.speaker}>
              <strong>{turn.speaker === "assistant" ? "Cadence" : "User"}</strong>
              <p className="turn-meta">{turn.timestamp}</p>
              <p>{turn.text}</p>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}
