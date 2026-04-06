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
import type { StageMode } from "../shared/stage-mode";
import type {
  AssistantPerformanceDirective,
  AvatarPerformanceSnapshot
} from "../shared/performance-directive";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceInputMode } from "../shared/voice-input-mode";
import type { VoiceBackendProvider } from "../shared/voice-backend";
import type { CadenceEvent } from "../shared/voice-events";
import {
  HotMicRecorder,
  type HotMicMonitorState,
  PushToTalkRecorder
} from "../services/audio/audioCapture";
import {
  createPerformanceDirective,
  inferPerformanceDirective
} from "../services/avatar/performanceHeuristics";
import { getCadenceBridge } from "../services/bridge";
import { snapshotFromDirective } from "./cadence/performance";
import {
  buildListeningStatusCopy,
  buildPreparingStatusCopy,
  buildReadyStatusCopy,
  buildSubmitStatusCopy
} from "./cadence/statusCopy";
import {
  estimateAssistantDeliveryMs,
  estimateAssistantReadMs,
  estimateUserReadMs,
  timestampNow
} from "./cadence/timing";
import { appendOrUpdateAssistantTurn, isBenignInterruptError } from "./cadence/turns";
import {
  createKindroidSession,
  createKindroidVoiceSession,
  createOpenAiBatchVoiceSession,
  createTextSession,
  createVoiceSession,
  defaultOpenAiBatchVoiceTransportConfig,
  defaultOpenAiBatchVoiceOpenAiTtsConfig,
  defaultOpenAiBatchVoiceTextOnlyConfig,
  defaultKindroidVoiceTextOnlyConfig,
  defaultKindroidVoiceOpenAiTtsConfig,
  defaultKindroidVoiceTransportConfig,
  defaultTextTransportConfig,
  defaultVoiceTransportConfig
} from "../services/transportOptions";

export function useCadenceController() {
  const [voiceSession] = useState(() => createVoiceSession());
  const [openAiBatchVoiceSession] = useState(() => createOpenAiBatchVoiceSession());
  const [kindroidVoiceSession] = useState(() => createKindroidVoiceSession());
  const [textSession] = useState(() => createTextSession());
  const [kindroidSession] = useState(() => createKindroidSession());
  const [mode, setMode] = useState<InteractionMode>("voice");
  const [stageMode, setStageMode] = useState<StageMode>("waveform");
  const [voiceBackend, setVoiceBackend] = useState<VoiceBackendProvider>("openai");
  const [voiceInputMode, setVoiceInputMode] = useState<VoiceInputMode>("push_to_talk");
  const [hotMicMuted, setHotMicMuted] = useState(false);
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
  const hotMicRecorderRef = useRef<HotMicRecorder | null>(null);
  const hotMicMutedRef = useRef(false);
  const assistantSpeakingRef = useRef(false);
  const playbackSuppressionTimerRef = useRef<number | null>(null);
  const poseHoldTimerRef = useRef<number | null>(null);
  const stagePhaseTimerRef = useRef<number | null>(null);
  const stageTimelineManagedRef = useRef(false);
  const pendingUserTurnIdRef = useRef<string | null>(null);
  const bufferedAssistantTurnRef = useRef<{
    turnId: string;
    text: string;
  } | null>(null);
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
        : voiceBackend === "openai-batch"
          ? openAiBatchVoiceSession
          : voiceSession
      : textBackend === "kindroid"
        ? kindroidSession
        : textSession;
  const stagedTextReplyMode =
    mode === "text" ||
    (mode === "voice" &&
      (voiceBackend === "kindroid" || voiceBackend === "openai-batch") &&
      ttsProvider === "none");
  const visualReplyPoseMode = stageMode === "avatar" && stagedTextReplyMode;
  const topology = useMemo(() => activeSession.describeTopology(), [activeSession]);

  useEffect(() => {
    recorderRef.current = new PushToTalkRecorder();
    hotMicRecorderRef.current = new HotMicRecorder();
  }, []);

  useEffect(() => {
    hotMicMutedRef.current = hotMicMuted;
    hotMicRecorderRef.current?.setSuppressed(hotMicMuted || assistantSpeakingRef.current);
  }, [hotMicMuted]);

  useEffect(
    () => () => {
      if (poseHoldTimerRef.current !== null) {
        window.clearTimeout(poseHoldTimerRef.current);
      }
      if (stagePhaseTimerRef.current !== null) {
        window.clearTimeout(stagePhaseTimerRef.current);
      }
      if (playbackSuppressionTimerRef.current !== null) {
        window.clearTimeout(playbackSuppressionTimerRef.current);
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

  function clearPlaybackSuppressionTimer(): void {
    if (playbackSuppressionTimerRef.current !== null) {
      window.clearTimeout(playbackSuppressionTimerRef.current);
      playbackSuppressionTimerRef.current = null;
    }
  }

  function releaseHotMicSuppression(): void {
    assistantSpeakingRef.current = false;
    hotMicRecorderRef.current?.setSuppressed(hotMicMutedRef.current);
  }

  function scheduleHotMicPlaybackRelease(text: string): void {
    if (
      mode !== "voice" ||
      voiceInputMode !== "hot_mic" ||
      ((voiceBackend === "kindroid" || voiceBackend === "openai-batch") && ttsProvider === "none")
    ) {
      return;
    }

    clearPlaybackSuppressionTimer();
    const directive = inferPerformanceDirective(text);
    const releaseInMs = estimateAssistantDeliveryMs(text, directive.pace) + 450;
    assistantSpeakingRef.current = true;
    hotMicRecorderRef.current?.setSuppressed(true);
    playbackSuppressionTimerRef.current = window.setTimeout(() => {
      playbackSuppressionTimerRef.current = null;
      releaseHotMicSuppression();
      if (connectionReady) {
        setStatusCopy("Hot mic is armed.");
      }
    }, releaseInMs);
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

  function insertPendingUserTurn(): void {
    pendingUserTurnIdRef.current = `pending-user-${crypto.randomUUID()}`;
  }

  function clearPendingUserTurn(): void {
    const pendingId = pendingUserTurnIdRef.current;
    if (!pendingId) {
      return;
    }

    pendingUserTurnIdRef.current = null;
    setTurns((previous) => previous.filter((turn) => turn.id !== pendingId));
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
    holdPoseState(
      "speaking",
      stagedTextReplyMode ? estimateAssistantReadMs(text) : estimateAssistantDeliveryMs(text, directive.pace)
    );
  }

  useEffect(() => {
    const bridge = getCadenceBridge();

    void bridge.settings
      .get()
      .then((snapshot) => {
        setSettingsSnapshot(snapshot);
        setMode(snapshot.preferences.mode);
        setStageMode(snapshot.preferences.stageMode);
        setTextBackend(snapshot.preferences.textBackend);
        setTtsProvider(snapshot.preferences.ttsProvider);
        setVoiceInputMode(snapshot.preferences.voiceInputMode);
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
      buildPreparingStatusCopy({
        mode,
        voiceBackend,
        textBackend,
        ttsProvider
      })
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
    } else if (mode === "voice" && voiceBackend === "openai-batch") {
      void Promise.all([
        bridge.openaiAudio.getState(),
        bridge.text.getState(),
        bridge.elevenlabs.getState(),
        bridge.openaiSpeech.getState()
      ]).then(([openAiAudioState, textState, elevenLabsState, openAiSpeechState]) => {
        const isConfigured =
          openAiAudioState.configured &&
          textState.configured &&
          (ttsProvider === "none"
            ? true
            : ttsProvider === "openai"
              ? openAiSpeechState.configured
              : elevenLabsState.configured);
        setConfigured(isConfigured);
        setBackendConfig({
          mode,
          providerLabel:
            ttsProvider === "none"
              ? "OpenAI Voice + Text Reply"
              : ttsProvider === "openai"
                ? "OpenAI Voice + OpenAI TTS"
                : "OpenAI Voice + ElevenLabs",
          configured: isConfigured,
          items: [
            {
              label: "OPENAI_API_KEY",
              present: openAiAudioState.apiKeyPresent
            },
            {
              label: "STT model",
              present: Boolean(openAiAudioState.model),
              value: openAiAudioState.model ?? undefined
            },
            {
              label: "Responses model",
              present: Boolean(textState.model),
              value: textState.model ?? undefined
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
                      value: openAiSpeechState.model ?? undefined
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
              clearPlaybackSuppressionTimer();
              releaseHotMicSuppression();
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
              clearPlaybackSuppressionTimer();
              releaseHotMicSuppression();
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
              if (voiceInputMode === "hot_mic") {
                assistantSpeakingRef.current = true;
                hotMicRecorderRef.current?.setSuppressed(true);
              }
              if (visualReplyPoseMode) {
                break;
              }
              clearPoseHold();
              setActiveStateId("speaking");
              break;
            case "ready":
              if (voiceInputMode !== "hot_mic") {
                releaseHotMicSuppression();
              }
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
                buildReadyStatusCopy({
                  mode,
                  voiceInputMode,
                  hotMicMuted: hotMicMutedRef.current
                })
              );
              break;
            case "disconnected":
              clearPlaybackSuppressionTimer();
              releaseHotMicSuppression();
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
          if (stagedTextReplyMode) {
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
          setTurns((previous) => {
            const pendingId = pendingUserTurnIdRef.current;
            let nextTurns = previous;
            if (pendingId) {
              pendingUserTurnIdRef.current = null;
              const existingPendingTurn = previous.find((turn) => turn.id === pendingId);
              nextTurns = existingPendingTurn
                ? previous.map((turn) =>
                turn.id === pendingId
                  ? {
                      ...turn,
                      id: event.turnId,
                      text: event.text
                    }
                  : turn
                )
                : [
                    ...previous,
                    {
                      id: event.turnId,
                      speaker: "user",
                      timestamp: timestampNow(),
                      text: event.text
                    }
                  ];
            } else {
              nextTurns = [
                ...previous,
                {
                  id: event.turnId,
                  speaker: "user",
                  timestamp: timestampNow(),
                  text: event.text
                }
              ];
            }

            const bufferedAssistantTurn = bufferedAssistantTurnRef.current;
            if (bufferedAssistantTurn) {
              bufferedAssistantTurnRef.current = null;
              nextTurns = appendOrUpdateAssistantTurn(
                nextTurns,
                bufferedAssistantTurn.turnId,
                bufferedAssistantTurn.text,
                "replace"
              );
            }

            return nextTurns;
          });
          break;
        case "assistant.response.delta":
          if (stagedTextReplyMode) {
            beginVisualReplyDelivery(event.text);
          }
          if (pendingUserTurnIdRef.current) {
            const buffered = bufferedAssistantTurnRef.current;
            bufferedAssistantTurnRef.current =
              buffered && buffered.turnId === event.turnId
                ? {
                    turnId: event.turnId,
                    text: buffered.text + event.text
                  }
                : {
                    turnId: event.turnId,
                    text: event.text
                  };
            break;
          }
          setTurns((previous) =>
            appendOrUpdateAssistantTurn(previous, event.turnId, event.text, "append")
          );
          break;
        case "assistant.response.completed":
          if (stagedTextReplyMode) {
            beginVisualReplyDelivery(event.text);
          } else {
            updatePerformance(inferPerformanceDirective(event.text), {
              retriggerGesture: true
            });
          }
          scheduleHotMicPlaybackRelease(event.text);
          if (pendingUserTurnIdRef.current) {
            bufferedAssistantTurnRef.current = {
              turnId: event.turnId,
              text: event.text
            };
            setStatusCopy("Response complete.");
            break;
          }
          setTurns((previous) =>
            appendOrUpdateAssistantTurn(previous, event.turnId, event.text, "replace")
          );
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
          clearPlaybackSuppressionTimer();
          releaseHotMicSuppression();
          bufferedAssistantTurnRef.current = null;
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
          if (isBenignInterruptError(event.message, event.recoverable)) {
            setStatusCopy(buildListeningStatusCopy(voiceInputMode, hotMicMutedRef.current));
            break;
          }
          clearPlaybackSuppressionTimer();
          releaseHotMicSuppression();
          clearPendingUserTurn();
          bufferedAssistantTurnRef.current = null;
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
          : voiceBackend === "openai-batch"
            ? ttsProvider === "none"
              ? defaultOpenAiBatchVoiceTextOnlyConfig
              : ttsProvider === "openai"
                ? defaultOpenAiBatchVoiceOpenAiTtsConfig
                : defaultOpenAiBatchVoiceTransportConfig
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
  }, [activeSession, mode, settingsLoaded, settingsRevision, stagedTextReplyMode, textBackend, ttsProvider, visualReplyPoseMode, voiceBackend, voiceInputMode]);

  useEffect(() => {
    const hotMicRecorder = hotMicRecorderRef.current;
    if (!hotMicRecorder) {
      return;
    }

    if (mode !== "voice" || voiceInputMode !== "hot_mic" || !connectionReady || !configured) {
      void hotMicRecorder.stop();
      return;
    }

    let cancelled = false;

    void hotMicRecorder.start({
      onSpeechStart: () => {
        if (cancelled) {
          return;
        }

        responseClock.current.interruptionStartedAt = performance.now();
        if (assistantSpeakingRef.current) {
          void activeSession.interrupt();
        }
        clearAvatarTimeline();
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
        setStatusCopy("Hot mic detected speech...");
      },
      onStateChange: (hotMicState: HotMicMonitorState) => {
        if (cancelled) {
          return;
        }

        if (assistantSpeakingRef.current && hotMicState !== "suppressed") {
          return;
        }

        switch (hotMicState) {
          case "armed":
            if (!assistantSpeakingRef.current && connectionReady) {
              setStatusCopy(hotMicMutedRef.current ? "Hot mic is paused." : "Hot mic is armed.");
            }
            break;
          case "waiting_for_end_silence":
            setStatusCopy("Waiting for the end of your turn...");
            break;
          case "cooldown":
            setStatusCopy("Hot mic cooling down...");
            break;
          case "suppressed":
            setStatusCopy(
              hotMicMutedRef.current
                ? "Hot mic is paused."
                : "Hot mic is paused while Cadence speaks."
            );
            break;
          default:
            break;
        }
      },
      onUtterance: async (audio: ArrayBuffer) => {
        if (cancelled || audio.byteLength === 0) {
          return;
        }

        const capturedAt = performance.now();
        insertPendingUserTurn();
        responseClock.current.startedAt = capturedAt;
        responseClock.current.firstAudioAt = null;
        setMetrics((previous) => ({
          ...previous,
          timeToListeningMs: previous.timeToListeningMs || 180,
          interruptRecoveryMs: Math.round(
            capturedAt - (responseClock.current.interruptionStartedAt ?? capturedAt)
          )
        }));
        setActiveStateId("transcribing");
        setStatusCopy("Uploading captured audio...");
        await activeSession.sendUserAudio(audio);
      }
    });

    hotMicRecorder.setSuppressed(assistantSpeakingRef.current);

    return () => {
      cancelled = true;
      void hotMicRecorder.stop();
    };
  }, [activeSession, configured, connectionReady, mode, voiceInputMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.code !== "Space" || voiceInputMode !== "push_to_talk") {
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
      if (event.code !== "Space" || mode !== "voice" || voiceInputMode !== "push_to_talk") {
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
  }, [connectionReady, isRecording, mode, voiceBackend, voiceInputMode]);

  async function startRecording(): Promise<void> {
    if (
      mode !== "voice" ||
      voiceInputMode !== "push_to_talk" ||
      isRecording ||
      !connectionReady ||
      !recorderRef.current
    ) {
      return;
    }

    responseClock.current.interruptionStartedAt = performance.now();
    if (assistantSpeakingRef.current) {
      await activeSession.interrupt();
    }
    await recorderRef.current.start();
    setIsRecording(true);
    clearAvatarTimeline();
    setActiveStateId("listening");
    setStatusCopy("Listening...");
  }

  async function stopRecording(): Promise<void> {
    if (
      mode !== "voice" ||
      voiceInputMode !== "push_to_talk" ||
      !isRecording ||
      !recorderRef.current
    ) {
      return;
    }

    const stoppedAt = performance.now();
    const audio = await recorderRef.current.stop();
    setIsRecording(false);
    if (audio.byteLength === 0) {
      clearPendingUserTurn();
      setStatusCopy("No audio captured.");
      return;
    }

    insertPendingUserTurn();
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
    if (stagedTextReplyMode) {
      beginVisualReplyPrelude(text);
    }
    setStatusCopy(
      buildSubmitStatusCopy({
        mode,
        voiceBackend,
        textBackend,
        ttsProvider
      })
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
          stageMode,
          textBackend,
          ttsProvider,
          voiceInputMode,
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
    hotMicMuted,
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
    stageMode,
    settingsFeedback,
    settingsLoaded,
    settingsSaveState,
    settingsSnapshot,
    voiceBackend,
    voiceInputMode,
    setInputText,
    setMode,
    setStageMode,
    setTextBackend,
    setTtsProvider,
    setVoiceInputMode,
    setVoiceBackend,
    setHotMicMuted,
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
