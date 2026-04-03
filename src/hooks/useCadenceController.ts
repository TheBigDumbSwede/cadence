import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAssistantSnapshot,
  type AssistantStateSnapshot,
  type PreviewAssistantStateId
} from "../shared/assistant-state";
import type { ConversationMetrics, ConversationTurn } from "../shared/conversation-types";
import type { BackendConfigSummary } from "../shared/backend-config";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { InteractionMode } from "../shared/interaction-mode";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceBackendProvider } from "../shared/voice-backend";
import type { CadenceEvent } from "../shared/voice-events";
import { PushToTalkRecorder } from "../services/audio/audioCapture";
import { getCadenceBridge } from "../services/bridge";
import {
  createKindroidSession,
  createKindroidVoiceSession,
  createTextSession,
  createVoiceSession,
  defaultKindroidVoiceTextOnlyConfig,
  defaultKindroidVoiceOpenAiTtsConfig,
  defaultKindroidVoiceTransportConfig,
  defaultTextTransportConfig,
  defaultVoiceTransportConfig
} from "../services/transportOptions";

function timestampNow(): string {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function nextStateFromEvent(event: CadenceEvent): PreviewAssistantStateId | null {
  switch (event.type) {
    case "session.status":
      switch (event.status) {
        case "listening":
          return "listening";
        case "thinking":
        case "connecting":
          return "thinking";
        case "speaking":
          return "speaking";
        case "ready":
        case "disconnected":
          return "idle";
        default:
          return null;
      }
    case "transport.error":
      return "error";
    case "assistant.interrupted":
      return "listening";
    default:
      return null;
  }
}

export function useCadenceController() {
  const [voiceSession] = useState(() => createVoiceSession());
  const [kindroidVoiceSession] = useState(() => createKindroidVoiceSession());
  const [textSession] = useState(() => createTextSession());
  const [kindroidSession] = useState(() => createKindroidSession());
  const [mode, setMode] = useState<InteractionMode>("voice");
  const [voiceBackend, setVoiceBackend] = useState<VoiceBackendProvider>("openai");
  const [textBackend, setTextBackend] = useState<TextBackendProvider>("openai");
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>("elevenlabs");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [activeStateId, setActiveStateId] = useState<PreviewAssistantStateId>("idle");
  const [statusCopy, setStatusCopy] = useState("Connect to OpenAI to begin.");
  const [connectionReady, setConnectionReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [backendConfig, setBackendConfig] = useState<BackendConfigSummary>({
    mode: "voice",
    providerLabel: "OpenAI Realtime",
    configured: false,
    items: []
  });
  const [isRecording, setIsRecording] = useState(false);
  const [inputText, setInputText] = useState("");
  const [metrics, setMetrics] = useState<ConversationMetrics>({
    timeToListeningMs: 0,
    timeToFirstSpeechMs: 0,
    interruptRecoveryMs: 0
  });
  const recorderRef = useRef<PushToTalkRecorder | null>(null);
  const responseClock = useRef<{
    startedAt: number | null;
    firstAudioAt: number | null;
    interruptionStartedAt: number | null;
  }>({
    startedAt: null,
    firstAudioAt: null,
    interruptionStartedAt: null
  });

  const activeSession =
    mode === "voice"
      ? voiceBackend === "kindroid"
        ? kindroidVoiceSession
        : voiceSession
      : textBackend === "kindroid"
        ? kindroidSession
        : textSession;
  const topology = useMemo(() => activeSession.describeTopology(), [activeSession]);

  useEffect(() => {
    recorderRef.current = new PushToTalkRecorder();
  }, []);

  useEffect(() => {
    setConnectionReady(false);
    setIsRecording(false);
    setStatusCopy(
      mode === "voice"
        ? voiceBackend === "kindroid"
          ? `Preparing Kindroid voice mode with ${
              ttsProvider === "none"
                ? "text replies only"
                : ttsProvider === "openai"
                  ? "OpenAI speech"
                  : "ElevenLabs"
            }...`
          : "Preparing voice mode..."
        : textBackend === "kindroid"
          ? "Preparing Kindroid text mode..."
          : "Preparing text-only mode..."
    );

    const bridge = getCadenceBridge();

    if (mode === "voice" && voiceBackend === "openai") {
      void bridge.realtime.getState().then((state) => {
        setConfigured(state.configured);
        setBackendConfig({
          mode,
          providerLabel: "OpenAI Realtime",
          configured: state.configured,
          items: [
            {
              label: "OPENAI_API_KEY",
              present: state.apiKeyPresent
            },
            {
              label: "Model",
              present: Boolean(state.model),
              value: state.model ?? undefined
            }
          ]
        });
      });
    } else if (mode === "voice" && voiceBackend === "kindroid") {
      void Promise.all([
        bridge.openaiAudio.getState(),
        bridge.kindroid.getState(),
        bridge.elevenlabs.getState(),
        bridge.openaiSpeech.getState()
      ]).then(([openAiState, kindroidState, elevenLabsState, openAiSpeechState]) => {
        const ttsConfigured =
          ttsProvider === "none"
            ? true
            : ttsProvider === "openai"
              ? openAiSpeechState.configured
              : elevenLabsState.configured;
        const isConfigured =
          openAiState.configured && kindroidState.configured && ttsConfigured;
        setConfigured(isConfigured);
        setBackendConfig({
          mode,
          providerLabel:
            ttsProvider === "none"
              ? "Kindroid Voice + Text Reply"
              : ttsProvider === "openai"
                ? "Kindroid Voice + OpenAI TTS"
                : "Kindroid Voice + ElevenLabs",
          configured: isConfigured,
          items: [
            {
              label: "OPENAI_API_KEY",
              present: openAiState.apiKeyPresent
            },
            {
              label: "STT model",
              present: Boolean(openAiState.model),
              value: openAiState.model
            },
            {
              label: "KINDROID_API_KEY",
              present: kindroidState.apiKeyPresent
            },
            {
              label: "KINDROID_AI_ID",
              present: kindroidState.aiIdPresent
            },
            ...(ttsProvider === "none"
              ? [
                  {
                    label: "Speech output",
                    present: true,
                    value: "Disabled"
                  }
                ]
              : ttsProvider === "openai"
              ? [
                  {
                    label: "OPENAI_API_KEY (TTS)",
                    present: openAiSpeechState.apiKeyPresent
                  },
                  {
                    label: "OPENAI_TTS_VOICE",
                    present: Boolean(openAiSpeechState.voice),
                    value: openAiSpeechState.voice ?? undefined
                  },
                  {
                    label: "TTS model",
                    present: Boolean(openAiSpeechState.model),
                    value: openAiSpeechState.model
                  }
                ]
              : [
                  {
                    label: "ELEVENLABS_API_KEY",
                    present: elevenLabsState.apiKeyPresent
                  },
                  {
                    label: "ELEVENLABS_VOICE_ID",
                    present: elevenLabsState.voiceIdPresent,
                    value: elevenLabsState.voiceId ?? undefined
                  },
                  {
                    label: "TTS model",
                    present: Boolean(elevenLabsState.model),
                    value: elevenLabsState.model
                  }
                ])
          ]
        });
      });
    } else if (textBackend === "kindroid") {
      void bridge.kindroid.getState().then((state) => {
        setConfigured(state.configured);
        setBackendConfig({
          mode,
          providerLabel: "Kindroid",
          configured: state.configured,
          items: [
            {
              label: "KINDROID_API_KEY",
              present: state.apiKeyPresent
            },
            {
              label: "KINDROID_AI_ID",
              present: state.aiIdPresent
            },
            {
              label: "Base URL",
              present: Boolean(state.baseUrl),
              value: state.baseUrl ?? undefined
            }
          ]
        });
      });
    } else {
      void bridge.text.getState().then((state) => {
        setConfigured(state.configured);
        setBackendConfig({
          mode,
          providerLabel: "OpenAI Responses",
          configured: state.configured,
          items: [
            {
              label: "OPENAI_API_KEY",
              present: state.apiKeyPresent
            },
            {
              label: "Model",
              present: Boolean(state.model),
              value: state.model ?? undefined
            }
          ]
        });
      });
    }

    const unsubscribe = activeSession.subscribe((event) => {
      const nextState = nextStateFromEvent(event);
      if (nextState) {
        setActiveStateId(nextState);
      }

      switch (event.type) {
        case "session.status":
          if (event.status === "ready") {
            setConnectionReady(true);
            setConfigured(true);
            setStatusCopy(
              mode === "voice"
                ? voiceBackend === "kindroid"
                  ? `Kindroid voice mode ready with ${
                      ttsProvider === "none"
                        ? "text replies only"
                        : ttsProvider === "openai"
                          ? "OpenAI speech"
                          : "ElevenLabs"
                    }. Hold the button or press Space to talk.`
                  : "Voice mode ready. Hold the button or press Space to talk."
                : textBackend === "kindroid"
                  ? "Kindroid text mode ready. Replies will use the configured AI ID."
                  : "Text-only mode ready. Use the text composer for cheaper iteration."
            );
          } else if (event.status === "connecting") {
            setStatusCopy("Connecting...");
          } else if (event.status === "thinking") {
            setStatusCopy("Thinking...");
          } else if (event.status === "speaking") {
            setStatusCopy("Speaking.");
          } else if (event.status === "disconnected") {
            setConnectionReady(false);
          }
          break;
        case "transcript.final":
          setTurns((previous) => [
            ...previous,
            {
              id: event.turnId,
              speaker: "user",
              timestamp: timestampNow(),
              text: event.text
            }
          ]);
          break;
        case "assistant.response.delta":
          setTurns((previous) => {
            const existingIndex = previous.findIndex((turn) => turn.id === event.turnId);
            if (existingIndex >= 0) {
              const updated = [...previous];
              updated[existingIndex] = {
                ...updated[existingIndex],
                text: updated[existingIndex].text + event.text
              };
              return updated;
            }

            return [
              ...previous,
              {
                id: event.turnId,
                speaker: "assistant",
                timestamp: timestampNow(),
                text: event.text
              }
            ];
          });
          break;
        case "assistant.response.completed":
          setTurns((previous) => {
            const existingIndex = previous.findIndex((turn) => turn.id === event.turnId);
            if (existingIndex < 0) {
              return [
                ...previous,
                {
                  id: event.turnId,
                  speaker: "assistant",
                  timestamp: timestampNow(),
                  text: event.text
                }
              ];
            }

            return previous.map((turn) =>
              turn.id === event.turnId
                ? {
                    ...turn,
                    text: event.text || turn.text
                  }
                : turn
            );
          });
          setStatusCopy("Response complete.");
          break;
        case "assistant.audio.chunk":
          if (!responseClock.current.firstAudioAt && responseClock.current.startedAt) {
            const now = performance.now();
            responseClock.current.firstAudioAt = now;
            setMetrics((previous) => ({
              ...previous,
              timeToFirstSpeechMs: Math.round(now - (responseClock.current.startedAt ?? now))
            }));
          }
          break;
        case "assistant.interrupted":
          responseClock.current.interruptionStartedAt = performance.now();
          setStatusCopy("Interrupted. Ready for the next utterance.");
          break;
        case "transport.error":
          setConnectionReady(false);
          setConfigured(event.message !== "OPENAI_API_KEY is not configured.");
          setStatusCopy(event.message);
          break;
        default:
          break;
      }
    });

    const config =
      mode === "voice"
        ? voiceBackend === "kindroid"
          ? ttsProvider === "none"
            ? defaultKindroidVoiceTextOnlyConfig
            : ttsProvider === "openai"
              ? defaultKindroidVoiceOpenAiTtsConfig
              : defaultKindroidVoiceTransportConfig
          : defaultVoiceTransportConfig
        : defaultTextTransportConfig;

    void activeSession.connect(config).catch((error: Error) => {
      setConfigured(false);
      setConnectionReady(false);
      setStatusCopy(error.message);
      setActiveStateId("error");
    });

    return () => {
      unsubscribe();
      void activeSession.disconnect();
    };
  }, [activeSession, mode, textBackend, ttsProvider, voiceBackend]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.code !== "Space") {
        return;
      }

      if (mode !== "voice") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|button|select/i.test(target.tagName)) {
        return;
      }

      event.preventDefault();
      void startRecording();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || mode !== "voice") {
        return;
      }

      event.preventDefault();
      void stopRecording();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [connectionReady, isRecording, mode, voiceBackend]);

  async function startRecording(): Promise<void> {
    if (mode !== "voice" || isRecording || !connectionReady || !recorderRef.current) {
      return;
    }

    responseClock.current.interruptionStartedAt = performance.now();
    await activeSession.interrupt();
    await recorderRef.current.start();
    setIsRecording(true);
    setActiveStateId("listening");
    setStatusCopy("Listening...");
  }

  async function stopRecording(): Promise<void> {
    if (mode !== "voice" || !isRecording || !recorderRef.current) {
      return;
    }

    const stoppedAt = performance.now();
    const audio = await recorderRef.current.stop();
    setIsRecording(false);
    if (audio.byteLength === 0) {
      setStatusCopy("No audio captured.");
      return;
    }

    responseClock.current.startedAt = stoppedAt;
    responseClock.current.firstAudioAt = null;
    setMetrics((previous) => ({
      ...previous,
      timeToListeningMs: previous.timeToListeningMs || 180,
      interruptRecoveryMs: Math.round(
        stoppedAt - (responseClock.current.interruptionStartedAt ?? stoppedAt)
      )
    }));

    setActiveStateId("transcribing");
    setStatusCopy("Uploading captured audio...");
    await activeSession.sendUserAudio(audio);
  }

  async function submitText(): Promise<void> {
    if (!inputText.trim()) {
      return;
    }

    responseClock.current.startedAt = performance.now();
    responseClock.current.firstAudioAt = null;
    const text = inputText.trim();
    setInputText("");
    setStatusCopy(
      mode === "voice"
        ? voiceBackend === "kindroid"
          ? `Sending text through Kindroid voice session with ${
              ttsProvider === "none"
                ? "text reply only"
                : ttsProvider === "openai"
                  ? "OpenAI speech"
                  : "ElevenLabs"
            }...`
          : "Sending text through voice session..."
        : textBackend === "kindroid"
          ? "Sending text to Kindroid..."
          : "Sending text..."
    );
    await activeSession.sendUserText(
      text,
      turns.map((turn) => ({
        speaker: turn.speaker,
        text: turn.text
      }))
    );
  }

  const activeState: AssistantStateSnapshot = useMemo(() => {
    const base = buildAssistantSnapshot(activeStateId);
    return {
      ...base,
      detail: statusCopy
    };
  }, [activeStateId, statusCopy]);

  return {
    activeState,
    configured,
    connectionReady,
    inputText,
    isRecording,
    metrics,
    mode,
    backendConfig,
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
    textBackend,
    ttsProvider,
    topology,
    turns
  };
}
