import { Fragment, useEffect, useMemo, useRef } from "react";
import type { ConversationTurn } from "../shared/conversation-types";
import type { InteractionMode } from "../shared/interaction-mode";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceInputMode } from "../shared/voice-input-mode";
import type { VoiceBackendProvider } from "../shared/voice-backend";

type ChatPanelProps = {
  activeKindroidGroupSpeakerParticipantId?: string | null;
  canStartNewChat: boolean;
  configured: boolean;
  connectionReady: boolean;
  composerPlaceholder?: string;
  conversationSummaryOverride?: string;
  hotMicMuted: boolean;
  inputText: string;
  isRecording: boolean;
  kindroidManualTurnTaking?: boolean;
  kindroidGroupAwaitingUserTurn?: boolean;
  kindroidGroupParticipants: Array<{
    id: string;
    label: string;
  }>;
  mode: InteractionMode;
  newChatPending: boolean;
  openChatBreakDialog: () => void;
  onRequestKindroidGroupParticipantTurn: (participantId: string) => Promise<void>;
  onSelectKindroidGroupSpeaker: (participantId: string) => Promise<void>;
  pendingAssistantHint?: {
    message: string;
    speakerLabel: string;
  } | null;
  textBackend: TextBackendProvider;
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

type MessageSegment = {
  text: string;
  narration: boolean;
};

function parseMessageSegments(text: string): MessageSegment[] {
  const matches = text.match(/\*[^*]+\*|[^*]+/g);
  if (!matches) {
    return [];
  }

  return matches.map((segment) => {
    const narration = segment.startsWith("*") && segment.endsWith("*") && segment.length >= 2;

    return {
      text: narration ? segment.slice(1, -1) : segment,
      narration
    };
  });
}

function renderMessageText(text: string) {
  const segments = parseMessageSegments(text);

  return segments.map((segment, segmentIndex) => {
    const lines = segment.text.split("\n");

    return (
      <span
        key={`segment-${segmentIndex}`}
        className={`message-segment ${segment.narration ? "narration" : "dialogue"}`}
      >
        {lines.map((line, lineIndex) => (
          <Fragment key={`line-${segmentIndex}-${lineIndex}`}>
            {line}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </span>
    );
  });
}

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
  activeKindroidGroupSpeakerParticipantId,
  canStartNewChat,
  configured,
  connectionReady,
  composerPlaceholder,
  conversationSummaryOverride,
  hotMicMuted,
  inputText,
  isRecording,
  kindroidManualTurnTaking,
  kindroidGroupAwaitingUserTurn,
  kindroidGroupParticipants,
  mode,
  newChatPending,
  openChatBreakDialog,
  onRequestKindroidGroupParticipantTurn,
  onSelectKindroidGroupSpeaker,
  pendingAssistantHint,
  textBackend,
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
  const showsKindroidGroupControls = kindroidGroupParticipants.length > 0;
  const manualKindroidGroupMode = Boolean(kindroidManualTurnTaking);
  const canPassTurn = !manualKindroidGroupMode && Boolean(kindroidGroupAwaitingUserTurn);
  const turnButtonTitle = manualKindroidGroupMode
    ? "Select next speaker"
    : canPassTurn
      ? "Pass turn to this Kin"
      : "Wait for Kindroid to return the turn";
  const conversationSummary =
    conversationSummaryOverride ??
    (mode === "voice"
      ? buildVoiceSummary(voiceBackend, ttsProvider)
      : textBackend === "kindroid"
        ? "Kindroid"
        : "Text-only");
  const pushToTalkEnabled = mode === "voice" && voiceInputMode === "push_to_talk";
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const lastTurnSignature = useMemo(() => {
    const lastTurn = turns.at(-1);
    const hintSignature = pendingAssistantHint
      ? `${pendingAssistantHint.speakerLabel}:${pendingAssistantHint.message.length}`
      : "none";
    return lastTurn ? `${lastTurn.id}:${lastTurn.text.length}:${hintSignature}` : `empty:${hintSignature}`;
  }, [pendingAssistantHint, turns]);

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
          <p className="panel-copy">{conversationSummary}</p>
        </div>
        <div className="chat-controls">
          {canStartNewChat ? (
            <button
              type="button"
              className="secondary-button"
              disabled={!configured || !connectionReady || isRecording || newChatPending}
              onClick={openChatBreakDialog}
            >
              {newChatPending ? "Running Chat Break..." : "Chat Break"}
            </button>
          ) : null}
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
                <strong>{turn.speakerLabel ?? (turn.speaker === "assistant" ? "Cadence" : "You")}</strong>
                <span>{turn.timestamp}</span>
              </p>
              <p className="message-text">{renderMessageText(turn.text)}</p>
            </article>
          ))
        )}
        {pendingAssistantHint ? (
          <article
            className="message-bubble message-bubble-pending"
            data-speaker="assistant"
            aria-live="polite"
          >
            <p className="message-meta">
              <strong>{pendingAssistantHint.speakerLabel}</strong>
            </p>
            <p className="message-text message-text-pending">{pendingAssistantHint.message}</p>
          </article>
        ) : null}
        <div ref={transcriptEndRef} className="transcript-endcap" />
      </div>

      <footer className="chat-composer">
        {showsKindroidGroupControls ? (
          <div className="chat-turn-controls" aria-label="Kindroid group participants">
            <div className="chat-turn-button-row">
              {kindroidGroupParticipants.map((participant) => {
                const active =
                  manualKindroidGroupMode &&
                  participant.id === activeKindroidGroupSpeakerParticipantId;
                const disabled =
                  !configured ||
                  !connectionReady ||
                  isRecording ||
                  newChatPending ||
                  (!manualKindroidGroupMode && !canPassTurn);

                return (
                  <button
                    key={participant.id}
                    type="button"
                    className={`secondary-button chat-turn-button ${active ? "active" : ""}`}
                    disabled={disabled}
                    title={turnButtonTitle}
                    aria-label={`${turnButtonTitle}: ${participant.label}`}
                    onClick={() => {
                      if (manualKindroidGroupMode) {
                        void onSelectKindroidGroupSpeaker(participant.id);
                        return;
                      }

                      void onRequestKindroidGroupParticipantTurn(participant.id);
                    }}
                  >
                    {participant.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <textarea
          className="compose-input composer-input"
          placeholder={composerPlaceholder ?? "Type a message and press Enter to send."}
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
