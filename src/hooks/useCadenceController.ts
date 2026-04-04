import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAssistantSnapshot,
  type AssistantStateSnapshot,
  type PreviewAssistantStateId
} from "../shared/assistant-state";
import type { ConversationMetrics, ConversationTurn } from "../shared/conversation-types";
import type { BackendConfigSummary } from "../shared/backend-config";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { AvatarSelection, SettingsSnapshot, SettingsUpdate } from "../shared/app-settings";
import type { InteractionMode } from "../shared/interaction-mode";
import type {
  AssistantPerformanceDirective,
  AvatarPerformanceSnapshot
} from "../shared/performance-directive";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceBackendProvider } from "../shared/voice-backend";
import type { CadenceEvent } from "../shared/voice-events";
import { PushToTalkRecorder } from "../services/audio/audioCapture";
import {
  createPerformanceDirective,
  inferPerformanceDirective
} from "../services/avatar/performanceHeuristics";
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateUserReadMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(320 + words * 70, 360, 1200);
}

function estimateAssistantDeliveryMs(
  text: string,
  pace: AvatarPerformanceSnapshot["pace"]
): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const basePerWord =
    pace === "animated" ? 150 : pace === "calm" ? 220 : 185;

  return clamp(1100 + words * basePerWord, 1600, 7000);
}

function snapshotFromDirective(
  directive: AssistantPerformanceDirective,
  previous?: AvatarPerformanceSnapshot,
  options?: {
    retriggerGesture?: boolean;
  }
): AvatarPerformanceSnapshot {
  const shouldRetrigger =
    directive.gesture !== "none" &&
    (options?.retriggerGesture || previous?.gesture !== directive.gesture);

  return {
    ...directive,
    gestureRevision: shouldRetrigger ? (previous?.gestureRevision ?? 0) + 1 : previous?.gestureRevision ?? 0
  };
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
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [settingsFeedback, setSettingsFeedback] = useState("");
  const [avatarPoseDebug, setAvatarPoseDebug] = useState(false);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [activeStateId, setActiveStateId] = useState<PreviewAssistantStateId>("idle");
  const [avatarPerformance, setAvatarPerformance] = useState<AvatarPerformanceSnapshot>(() =>
    snapshotFromDirective(createPerformanceDirective())
  );
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
  const poseHoldTimerRef = useRef<number | null>(null);
  const stagePhaseTimerRef = useRef<number | null>(null);
  const stageTimelineManagedRef = useRef(false);
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
  const visualReplyPoseMode =
    mode === "text" || (mode === "voice" && voiceBackend === "kindroid" && ttsProvider === "none");
  const topology = useMemo(() => activeSession.describeTopology(), [activeSession]);

  useEffect(() => {
    recorderRef.current = new PushToTalkRecorder();
  }, []);

  useEffect(
    () => () => {
      if (poseHoldTimerRef.current !== null) {
        window.clearTimeout(poseHoldTimerRef.current);
      }
      if (stagePhaseTimerRef.current !== null) {
        window.clearTimeout(stagePhaseTimerRef.current);
      }
    },
    []
  );

  function clearStagePhaseTimer(): void {
    if (stagePhaseTimerRef.current !== null) {
      window.clearTimeout(stagePhaseTimerRef.current);
      stagePhaseTimerRef.current = null;
    }
  }

  function clearPoseHold(): void {
    if (poseHoldTimerRef.current !== null) {
      window.clearTimeout(poseHoldTimerRef.current);
      poseHoldTimerRef.current = null;
    }
  }

  function clearAvatarTimeline(): void {
    clearPoseHold();
    clearStagePhaseTimer();
    stageTimelineManagedRef.current = false;
  }

  function holdPoseState(state: PreviewAssistantStateId, durationMs = 1100): void {
    clearPoseHold();
    setActiveStateId(state);
    poseHoldTimerRef.current = window.setTimeout(() => {
      poseHoldTimerRef.current = null;
      stageTimelineManagedRef.current = false;
      updatePerformance(
        createPerformanceDirective({
          mood: "neutral",
          gesture: "none",
          intensity: 0.26,
          pace: "steady",
          cue: "ready"
        })
      );
      setActiveStateId("idle");
    }, durationMs);
  }

  function updatePerformance(
    directive: AssistantPerformanceDirective,
    options?: {
      retriggerGesture?: boolean;
    }
  ): void {
    setAvatarPerformance((previous) => snapshotFromDirective(directive, previous, options));
  }

  function beginVisualReplyPrelude(text: string): void {
    clearAvatarTimeline();
    stageTimelineManagedRef.current = true;
    setActiveStateId("listening");
    updatePerformance(
      createPerformanceDirective({
        mood: "focused",
        gesture: "none",
        intensity: 0.3,
        pace: "steady",
        cue: "user-turn"
      })
    );

    stagePhaseTimerRef.current = window.setTimeout(() => {
      stagePhaseTimerRef.current = null;
      if (!stageTimelineManagedRef.current) {
        return;
      }

      setActiveStateId("thinking");
      updatePerformance(
        createPerformanceDirective({
          mood: "focused",
          gesture: "thinking_touch",
          intensity: 0.32,
          pace: "calm",
          cue: "thinking"
        })
      );
    }, estimateUserReadMs(text));
  }

  function beginVisualReplyDelivery(text: string): void {
    const directive = inferPerformanceDirective(text);
    clearStagePhaseTimer();
    stageTimelineManagedRef.current = true;
    updatePerformance(directive, { retriggerGesture: true });
    holdPoseState("speaking", estimateAssistantDeliveryMs(text, directive.pace));
  }

  useEffect(() => {
    const bridge = getCadenceBridge();

    void bridge.settings
      .get()
      .then((snapshot) => {
        setSettingsSnapshot(snapshot);
        setMode(snapshot.preferences.mode);
        setTextBackend(snapshot.preferences.textBackend);
        setTtsProvider(snapshot.preferences.ttsProvider);
        setVoiceBackend(snapshot.preferences.voiceBackend);
        setSettingsLoaded(true);
      })
      .catch((error: Error) => {
        setSettingsFeedback(error.message);
        setSettingsSaveState("error");
        setSettingsLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      setConnectionReady(false);
      setConfigured(false);
      setStatusCopy("Loading settings...");
      return;
    }

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
      switch (event.type) {
        case "session.status":
          switch (event.status) {
            case "listening":
              clearPoseHold();
              setActiveStateId("listening");
              updatePerformance(
                createPerformanceDirective({
                  mood: "focused",
                  gesture: "none",
                  intensity: 0.24,
                  pace: "steady",
                  cue: "listening"
                })
              );
              break;
            case "connecting":
            case "thinking":
              if (visualReplyPoseMode && stageTimelineManagedRef.current) {
                break;
              }
              clearPoseHold();
              setActiveStateId("thinking");
              updatePerformance(
                createPerformanceDirective({
                  mood: "focused",
                  gesture: "thinking_touch",
                  intensity: 0.28,
                  pace: "calm",
                  cue: "thinking"
                })
              );
              break;
            case "speaking":
              if (visualReplyPoseMode) {
                break;
              }
              clearPoseHold();
              setActiveStateId("speaking");
              break;
            case "ready":
              if (!poseHoldTimerRef.current && !stageTimelineManagedRef.current) {
                setActiveStateId("idle");
              }
              if (!visualReplyPoseMode && !stageTimelineManagedRef.current) {
                updatePerformance(
                  createPerformanceDirective({
                    mood: "neutral",
                    gesture: "none",
                    intensity: 0.26,
                    pace: "steady",
                    cue: "ready"
                  })
                );
              }
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
              break;
            case "disconnected":
              clearAvatarTimeline();
              setActiveStateId("idle");
              updatePerformance(createPerformanceDirective());
              setConnectionReady(false);
              break;
            default:
              break;
          }
          break;
        case "transcript.final":
          if (visualReplyPoseMode) {
            if (!stageTimelineManagedRef.current) {
              beginVisualReplyPrelude(event.text);
            }
          } else {
            updatePerformance(
              createPerformanceDirective({
                mood: "focused",
                gesture: "thinking_touch",
                intensity: 0.3,
                pace: "calm",
                cue: "user-turn"
              })
            );
          }
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
          if (visualReplyPoseMode) {
            beginVisualReplyDelivery(event.text);
          }
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
          if (visualReplyPoseMode) {
            beginVisualReplyDelivery(event.text);
          } else {
            updatePerformance(inferPerformanceDirective(event.text), {
              retriggerGesture: true
            });
          }
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
          clearAvatarTimeline();
          setActiveStateId("listening");
          updatePerformance(
            createPerformanceDirective({
              mood: "focused",
              gesture: "none",
              intensity: 0.25,
              pace: "steady",
              cue: "interrupted"
            })
          );
          responseClock.current.interruptionStartedAt = performance.now();
          setStatusCopy("Interrupted. Ready for the next utterance.");
          break;
        case "transport.error":
          clearAvatarTimeline();
          setActiveStateId("error");
          updatePerformance(
            createPerformanceDirective({
              mood: "concerned",
              gesture: "small_shrug",
              intensity: 0.36,
              pace: "calm",
              cue: "error",
              source: "default"
            }),
            { retriggerGesture: true }
          );
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
  }, [activeSession, mode, settingsLoaded, settingsRevision, textBackend, ttsProvider, visualReplyPoseMode, voiceBackend]);

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
    clearAvatarTimeline();
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
    if (visualReplyPoseMode) {
      beginVisualReplyPrelude(text);
    }
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

  async function saveSettings(
    update: Omit<SettingsUpdate, "preferences">
  ): Promise<void> {
    const bridge = getCadenceBridge();

    setSettingsSaveState("saving");
    setSettingsFeedback("Saving settings...");

    try {
      const snapshot = await bridge.settings.update({
        ...update,
        preferences: {
          mode,
          textBackend,
          ttsProvider,
          voiceBackend
        }
      });

      setSettingsSnapshot(snapshot);
      setSettingsSaveState("saved");
      setSettingsFeedback("Settings saved.");
      setSettingsRevision((previous) => previous + 1);
    } catch (error) {
      setSettingsSaveState("error");
      setSettingsFeedback(
        error instanceof Error ? error.message : "Failed to save settings."
      );
    }
  }

  async function chooseAvatarFile(): Promise<AvatarSelection | null> {
    const bridge = getCadenceBridge();
    return bridge.settings.chooseAvatarFile();
  }

  async function setAvatar(filePath: string | null): Promise<void> {
    const bridge = getCadenceBridge();

    setSettingsSaveState("saving");
    setSettingsFeedback(filePath ? "Updating avatar..." : "Clearing avatar...");

    try {
      const snapshot = await bridge.settings.setAvatar(filePath);
      setSettingsSnapshot(snapshot);
      setSettingsSaveState("saved");
      setSettingsFeedback(filePath ? "Avatar updated." : "Avatar cleared.");
    } catch (error) {
      setSettingsSaveState("error");
      setSettingsFeedback(
        error instanceof Error ? error.message : "Failed to update avatar."
      );
    }
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
    avatarPoseDebug,
    configured,
    connectionReady,
    inputText,
    isRecording,
    metrics,
    mode,
    backendConfig,
    chooseAvatarFile,
    performance: avatarPerformance,
    saveSettings,
    setAvatar,
    setAvatarPoseDebug,
    settingsFeedback,
    settingsLoaded,
    settingsSaveState,
    settingsSnapshot,
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
