import { useEffect, useMemo, useRef } from "react";
import type { ConversationTurn } from "../shared/conversation-types";
import type { InteractionMode } from "../shared/interaction-mode";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceInputMode } from "../shared/voice-input-mode";
import type { VoiceBackendProvider } from "../shared/voice-backend";

type ChatPanelProps = {
  configured: boolean;
  connectionReady: boolean;
  hotMicMuted: boolean;
  inputText: string;
  isRecording: boolean;
  mode: InteractionMode;
  ttsProvider: TtsProvider;
  turns: ConversationTurn[];
  voiceBackend: VoiceBackendProvider;
  voiceInputMode: VoiceInputMode;
  setHotMicMuted: (muted: boolean) => void;
  setInputText: (value: string) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  submitText: () => Promise<void>;
};

function buildVoiceSummary(voiceBackend: VoiceBackendProvider, ttsProvider: TtsProvider): string {
  if (voiceBackend === "openai") {
    return "OpenAI Realtime";
  }

  if (voiceBackend === "openai-batch") {
    if (ttsProvider === "none") {
      return "OpenAI Voice · Text Reply";
    }

    return `OpenAI Voice · ${ttsProvider === "openai" ? "OpenAI Speech" : "ElevenLabs"}`;
  }

  if (ttsProvider === "none") {
    return "Kindroid Voice · Text Reply";
  }

  return `Kindroid Voice · ${ttsProvider === "openai" ? "OpenAI Speech" : "ElevenLabs"}`;
}

export function ChatPanel({
  configured,
  connectionReady,
  hotMicMuted,
  inputText,
  isRecording,
  mode,
  ttsProvider,
  turns,
  voiceBackend,
  voiceInputMode,
  setHotMicMuted,
  setInputText,
  startRecording,
  stopRecording,
  submitText
}: ChatPanelProps) {
  const canSendText = connectionReady && inputText.trim().length > 0;
  const voiceSummary = buildVoiceSummary(voiceBackend, ttsProvider);
  const pushToTalkEnabled = mode === "voice" && voiceInputMode === "push_to_talk";
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const lastTurnSignature = useMemo(() => {
    const lastTurn = turns.at(-1);
    return lastTurn ? `${lastTurn.id}:${lastTurn.text.length}` : "empty";
  }, [turns]);

  useEffect(() => {
    const endCap = transcriptEndRef.current;
    if (!endCap) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      endCap.scrollIntoView({
        block: "end",
        behavior: turns.length > 1 ? "smooth" : "auto"
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [lastTurnSignature, turns.length]);

  return (
    <section className="panel chat-panel">
      <header className="chat-header">
        <div>
          <p className="eyebrow">Conversation</p>
          <p className="panel-copy">{mode === "voice" ? voiceSummary : "Text-only"}</p>
        </div>
        <div className="chat-controls">
          <button
            type="button"
            className={`chat-action ${isRecording ? "active" : ""}`}
            disabled={!pushToTalkEnabled || !configured || !connectionReady}
            onMouseDown={() => void startRecording()}
            onMouseUp={() => void stopRecording()}
            onMouseLeave={() => void stopRecording()}
            onTouchStart={() => void startRecording()}
            onTouchEnd={() => void stopRecording()}
          >
            {mode !== "voice"
              ? "Voice Disabled"
              : voiceInputMode === "hot_mic"
                ? "Hot Mic Live"
                : isRecording
                  ? "Release To Send"
                  : "Hold To Talk"}
          </button>
          {mode === "voice" && voiceInputMode === "hot_mic" ? (
            <button
              type="button"
              className={`secondary-button ${hotMicMuted ? "active" : ""}`}
              disabled={!configured || !connectionReady}
              onClick={() => setHotMicMuted(!hotMicMuted)}
            >
              {hotMicMuted ? "Unmute Mic" : "Mute Mic"}
            </button>
          ) : null}
        </div>
      </header>

      <div ref={transcriptRef} className="chat-transcript">
        {turns.length === 0 ? (
          <article className="chat-empty">
            <strong>No turns yet</strong>
            <p className="setting-copy">
              Start with voice or type into the composer below. Shift+Enter inserts a new line;
              Enter sends.
            </p>
          </article>
        ) : (
          turns.map((turn) => (
            <article key={turn.id} className="message-bubble" data-speaker={turn.speaker}>
              <p className="message-meta">
                <strong>{turn.speaker === "assistant" ? "Cadence" : "You"}</strong>
                <span>{turn.timestamp}</span>
              </p>
              <p className="message-text">{turn.text}</p>
            </article>
          ))
        )}
        <div ref={transcriptEndRef} className="transcript-endcap" />
      </div>

      <footer className="chat-composer">
        <textarea
          className="compose-input composer-input"
          placeholder="Type a message and press Enter to send."
          rows={3}
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSendText) {
                void submitText();
              }
            }
          }}
        />
        <button
          type="button"
          className="chat-send"
          disabled={!canSendText}
          onClick={() => void submitText()}
        >
          Send
        </button>
      </footer>
    </section>
  );
}
