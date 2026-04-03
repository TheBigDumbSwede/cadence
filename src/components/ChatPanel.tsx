import { useEffect, useMemo, useRef } from "react";
import type { ConversationTurn } from "../shared/conversation-types";
import type { InteractionMode } from "../shared/interaction-mode";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceBackendProvider } from "../shared/voice-backend";

type ChatPanelProps = {
  configured: boolean;
  connectionReady: boolean;
  inputText: string;
  isRecording: boolean;
  mode: InteractionMode;
  statusCopy: string;
  ttsProvider: TtsProvider;
  turns: ConversationTurn[];
  voiceBackend: VoiceBackendProvider;
  setInputText: (value: string) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  submitText: () => Promise<void>;
};

function buildVoiceSummary(voiceBackend: VoiceBackendProvider, ttsProvider: TtsProvider): string {
  if (voiceBackend === "openai") {
    return "OpenAI Realtime voice is active.";
  }

  if (ttsProvider === "none") {
    return "Kindroid voice is using speech in and text replies out.";
  }

  return `Kindroid voice is using ${
    ttsProvider === "openai" ? "OpenAI speech" : "ElevenLabs"
  } for output.`;
}

export function ChatPanel({
  configured,
  connectionReady,
  inputText,
  isRecording,
  mode,
  statusCopy,
  ttsProvider,
  turns,
  voiceBackend,
  setInputText,
  startRecording,
  stopRecording,
  submitText
}: ChatPanelProps) {
  const canSendText = connectionReady && inputText.trim().length > 0;
  const voiceSummary = buildVoiceSummary(voiceBackend, ttsProvider);
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
        <div className="panel-header-copy">
          <p className="eyebrow">Conversation</p>
          <p className="panel-copy">{mode === "voice" ? voiceSummary : "Text-only mode is active."}</p>
        </div>
        <div className="chat-controls">
          <div className="state-chip">{connectionReady ? "Live" : "Standby"}</div>
          <button
            type="button"
            className={`chat-action ${isRecording ? "active" : ""}`}
            disabled={mode !== "voice" || !configured || !connectionReady}
            onMouseDown={() => void startRecording()}
            onMouseUp={() => void stopRecording()}
            onMouseLeave={() => void stopRecording()}
            onTouchStart={() => void startRecording()}
            onTouchEnd={() => void stopRecording()}
          >
            {mode === "voice" ? (isRecording ? "Release To Send" : "Hold To Talk") : "Voice Disabled"}
          </button>
        </div>
      </header>

      <div className="chat-status-line">
        <strong>Status</strong>
        <span>{statusCopy}</span>
      </div>

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
