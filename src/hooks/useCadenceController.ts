import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAssistantSnapshot,
  type AssistantStateSnapshot,
  type PreviewAssistantStateId
} from "../shared/assistant-state";
import type { ConversationMetrics, ConversationTurn } from "../shared/conversation-types";
import type { BackendConfigSummary } from "../shared/backend-config";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { SettingsSnapshot, SettingsUpdate } from "../shared/app-settings";
import type { InteractionMode } from "../shared/interaction-mode";
import type { PresenceSnapshot } from "../shared/performance-directive";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceInputMode } from "../shared/voice-input-mode";
import type { VoiceBackendProvider } from "../shared/voice-backend";
import {
  findActiveSpeechCaptionCue,
  offsetSpeechCaptionCues,
  scaleSpeechCaptionCues
} from "../shared/speech-captions";
import type { HotMicRecorder, PushToTalkRecorder } from "../services/audio/audioCapture";
import {
  getOutputPlaybackSnapshot,
  subscribeToOutputPlayback
} from "../services/audio/outputPlaybackStore";
import { createPerformanceDirective } from "../services/stage/performanceHeuristics";
import { getCadenceBridge } from "../services/bridge";
import { snapshotFromDirective } from "./cadence/performance";
import { useCadenceInputOrchestrator } from "./cadence/useCadenceInputOrchestrator";
import {
  handleCadenceSessionEvent,
  type PendingConversationHint,
  type TurnCaptionTrack,
  type TurnEffectCaptionTrack
} from "./cadence/sessionEvents";
import { useCadenceStageOrchestrator } from "./cadence/useCadenceStageOrchestrator";
import { buildPreparingStatusCopy } from "./cadence/statusCopy";
import { timestampNow } from "./cadence/timing";
import {
  createKindroidGroupSession,
  createKindroidGroupVoiceSession,
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
  const [kindroidGroupVoiceSession] = useState(() => createKindroidGroupVoiceSession());
  const [textSession] = useState(() => createTextSession());
  const [kindroidSession] = useState(() => createKindroidSession());
  const [kindroidGroupSession] = useState(() => createKindroidGroupSession());
  const [mode, setMode] = useState<InteractionMode>("voice");
  const [voiceBackend, setVoiceBackend] = useState<VoiceBackendProvider>("openai");
  const [voiceInputMode, setVoiceInputMode] = useState<VoiceInputMode>("push_to_talk");
  const [hotMicMuted, setHotMicMuted] = useState(false);
  const [textBackend, setTextBackend] = useState<TextBackendProvider>("openai");
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>("elevenlabs");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [settingsSaveState, setSettingsSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [settingsFeedback, setSettingsFeedback] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [activeStateId, setActiveStateId] = useState<PreviewAssistantStateId>("idle");
  const [, setPresenceSnapshot] = useState<PresenceSnapshot>(() =>
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
  const [newChatPending, setNewChatPending] = useState(false);
  const [metrics, setMetrics] = useState<ConversationMetrics>({
    timeToListeningMs: 0,
    timeToFirstSpeechMs: 0,
    interruptRecoveryMs: 0
  });
  const [lastMemoryRecall, setLastMemoryRecall] = useState<{
    provider: string;
    contextBlock: string;
  } | null>(null);
  const [lastMemoryIngest, setLastMemoryIngest] = useState<{
    provider: string;
    written: number;
    updated: number;
    ignored: number;
  } | null>(null);
  const [pendingConversationHint, setPendingConversationHint] =
    useState<PendingConversationHint | null>(null);
  const [outputPlayback, setOutputPlayback] = useState(() => getOutputPlaybackSnapshot());
  const [activeSpeechCaption, setActiveSpeechCaption] = useState<{
    speakerLabel?: string;
    text: string;
  } | null>(null);
  const [activeEffectCaption, setActiveEffectCaption] = useState<string | null>(null);
  const recorderRef = useRef<PushToTalkRecorder | null>(null);
  const hotMicRecorderRef = useRef<HotMicRecorder | null>(null);
  const hotMicMutedRef = useRef(false);
  const settingsFeedbackTimerRef = useRef<number | null>(null);
  const assistantTurnParticipantIdsRef = useRef(new Map<string, string>());
  const assistantTurnCaptionCuesRef = useRef(new Map<string, TurnCaptionTrack>());
  const assistantTurnEffectCaptionsRef = useRef(new Map<string, TurnEffectCaptionTrack>());
  const pendingUserTurnIdRef = useRef<string | null>(null);
  const bufferedAssistantTurnRef = useRef<{
    turnId: string;
    text: string;
    speakerLabel?: string;
    kindroidParticipantId?: string;
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

  const activeKindroidParticipant = useMemo(() => {
    if (!settingsSnapshot) {
      return null;
    }

    const participants = settingsSnapshot.kindroidParticipants;
    if (participants.length === 0) {
      return null;
    }

    const activeParticipant =
      participants.find(
        (participant) => participant.id === settingsSnapshot.activeKindroidParticipantId
      ) ?? participants[0];

    return activeParticipant ?? null;
  }, [settingsSnapshot]);
  const kindroidGroupMirrors = useMemo(
    () => settingsSnapshot?.kindroidGroupMirrors ?? [],
    [settingsSnapshot?.kindroidGroupMirrors]
  );
  const activeKindroidGroupMirror = useMemo(() => {
    if (kindroidGroupMirrors.length === 0 || !settingsSnapshot?.activeKindroidGroupMirrorId) {
      return kindroidGroupMirrors[0] ?? null;
    }

    return (
      kindroidGroupMirrors.find(
        (groupMirror) => groupMirror.id === settingsSnapshot.activeKindroidGroupMirrorId
      ) ??
      kindroidGroupMirrors[0] ??
      null
    );
  }, [kindroidGroupMirrors, settingsSnapshot?.activeKindroidGroupMirrorId]);
  const kindroidConversationMode = settingsSnapshot?.kindroidConversationMode ?? "solo";
  const usesKindroidGroupConversation =
    kindroidConversationMode === "group" && Boolean(activeKindroidGroupMirror);
  const activeKindroidGroupParticipants = useMemo(
    () =>
      settingsSnapshot?.kindroidParticipants.filter((participant) =>
        activeKindroidGroupMirror?.participantIds.includes(participant.id)
      ) ?? [],
    [activeKindroidGroupMirror?.participantIds, settingsSnapshot?.kindroidParticipants]
  );
  const groupKindroidUsesOpenAiSpeech = activeKindroidGroupParticipants.some(
    (participant) => participant.ttsProvider === "openai"
  );
  const groupKindroidUsesElevenLabsSpeech = activeKindroidGroupParticipants.some(
    (participant) => participant.ttsProvider === "elevenlabs"
  );
  const groupKindroidHasAnySpeech =
    groupKindroidUsesOpenAiSpeech || groupKindroidUsesElevenLabsSpeech;
  const kindroidStageCaptioningEnabled =
    (mode === "voice" && voiceBackend === "kindroid") ||
    (mode === "text" && textBackend === "kindroid");
  const activeWaveformKindroidParticipant = useMemo(() => {
    const usesKindroid =
      (mode === "voice" && voiceBackend === "kindroid") ||
      (mode === "text" && textBackend === "kindroid");
    if (!usesKindroid) {
      return null;
    }

    if (!usesKindroidGroupConversation) {
      return activeKindroidParticipant;
    }

    const activePlaybackParticipantId = outputPlayback.activeTurnId
      ? (assistantTurnParticipantIdsRef.current.get(outputPlayback.activeTurnId) ?? null)
      : null;

    if (activePlaybackParticipantId) {
      return (
        settingsSnapshot?.kindroidParticipants.find(
          (participant) => participant.id === activePlaybackParticipantId
        ) ?? null
      );
    }

    if (
      pendingConversationHint?.kind === "assistant" &&
      pendingConversationHint.kindroidParticipantId
    ) {
      return (
        settingsSnapshot?.kindroidParticipants.find(
          (participant) => participant.id === pendingConversationHint.kindroidParticipantId
        ) ?? null
      );
    }

    const lastAssistantParticipantId = [...turns]
      .reverse()
      .find(
        (turn) => turn.speaker === "assistant" && turn.kindroidParticipantId
      )?.kindroidParticipantId;

    if (!lastAssistantParticipantId) {
      return null;
    }

    return (
      settingsSnapshot?.kindroidParticipants.find(
        (participant) => participant.id === lastAssistantParticipantId
      ) ?? null
    );
  }, [
    activeKindroidParticipant,
    mode,
    outputPlayback.activeTurnId,
    pendingConversationHint,
    settingsSnapshot?.kindroidParticipants,
    textBackend,
    turns,
    usesKindroidGroupConversation,
    voiceBackend
  ]);
  const activeSession =
    mode === "voice"
      ? voiceBackend === "kindroid"
        ? usesKindroidGroupConversation
          ? kindroidGroupVoiceSession
          : kindroidVoiceSession
        : voiceBackend === "openai-batch"
          ? openAiBatchVoiceSession
          : voiceSession
      : textBackend === "kindroid"
        ? usesKindroidGroupConversation
          ? kindroidGroupSession
          : kindroidSession
        : textSession;
  const effectiveKindroidTtsProvider = activeKindroidParticipant?.ttsProvider ?? ttsProvider;
  const effectiveTtsProvider =
    mode === "voice" && voiceBackend === "kindroid" && !usesKindroidGroupConversation
      ? effectiveKindroidTtsProvider
      : ttsProvider;
  const stagedTextReplyMode =
    mode === "text" ||
    (mode === "voice" &&
      ((voiceBackend === "kindroid" &&
        ((usesKindroidGroupConversation && !groupKindroidHasAnySpeech) ||
          (!usesKindroidGroupConversation && effectiveKindroidTtsProvider === "none"))) ||
        (voiceBackend === "openai-batch" && ttsProvider === "none")));
  const requiresLiveConnection = mode === "voice" && voiceBackend === "openai";
  const interactionReady = configured && (!requiresLiveConnection || connectionReady);
  const {
    assistantSpeakingRef,
    poseHoldTimerRef,
    stageTimelineManagedRef,
    updatePerformance,
    clearPoseHold,
    clearStageTimeline,
    clearPlaybackSuppressionTimer,
    suppressHotMicPlayback,
    releaseHotMicSuppression,
    scheduleHotMicPlaybackRelease,
    beginVisualReplyPrelude,
    beginVisualReplyDelivery
  } = useCadenceStageOrchestrator({
    mode,
    voiceBackend,
    voiceInputMode,
    ttsProvider,
    effectiveKindroidTtsProvider,
    connectionReady,
    stagedTextReplyMode,
    activeKindroidParticipant,
    usesKindroidGroupConversation,
    kindroidParticipants: settingsSnapshot?.kindroidParticipants ?? [],
    hotMicRecorderRef,
    hotMicMutedRef,
    setStatusCopy,
    setActiveStateId,
    setPresenceSnapshot
  });
  const topology = useMemo(() => activeSession.describeTopology(), [activeSession]);

  function getAssistantTurnMetadata(): {
    speakerLabel?: string;
    kindroidParticipantId?: string;
  } {
    const usesKindroid =
      (mode === "voice" && voiceBackend === "kindroid") ||
      (mode === "text" && textBackend === "kindroid");

    if (!usesKindroid) {
      return {};
    }

    const participant = usesKindroidGroupConversation ? null : activeKindroidParticipant;

    if (!participant) {
      return {};
    }

    return {
      speakerLabel: participant.bubbleName,
      kindroidParticipantId: participant.id
    };
  }

  useEffect(
    () => () => {
      if (settingsFeedbackTimerRef.current !== null) {
        window.clearTimeout(settingsFeedbackTimerRef.current);
      }
    },
    []
  );

  useEffect(() => subscribeToOutputPlayback(setOutputPlayback), []);

  useEffect(() => {
    const nextEntries = new Map<string, string>();
    const nextCaptionEntries = new Map<string, TurnCaptionTrack>();
    const nextEffectCaptionEntries = new Map<string, TurnEffectCaptionTrack>();

    for (const turn of turns) {
      if (turn.speaker === "assistant" && turn.kindroidParticipantId) {
        nextEntries.set(turn.id, turn.kindroidParticipantId);
      }
      const captionTrack = assistantTurnCaptionCuesRef.current.get(turn.id);
      if (turn.speaker === "assistant" && captionTrack) {
        nextCaptionEntries.set(turn.id, captionTrack);
      }
      const effectCaption = assistantTurnEffectCaptionsRef.current.get(turn.id);
      if (turn.speaker === "assistant" && effectCaption) {
        nextEffectCaptionEntries.set(turn.id, effectCaption);
      }
    }

    if (outputPlayback.activeTurnId) {
      const activePlaybackParticipantId = assistantTurnParticipantIdsRef.current.get(
        outputPlayback.activeTurnId
      );
      if (activePlaybackParticipantId) {
        nextEntries.set(outputPlayback.activeTurnId, activePlaybackParticipantId);
      }
      const activeCaptionTrack = assistantTurnCaptionCuesRef.current.get(
        outputPlayback.activeTurnId
      );
      if (activeCaptionTrack) {
        nextCaptionEntries.set(outputPlayback.activeTurnId, activeCaptionTrack);
      }
      const activeEffectCaption = assistantTurnEffectCaptionsRef.current.get(
        outputPlayback.activeTurnId
      );
      if (activeEffectCaption) {
        nextEffectCaptionEntries.set(outputPlayback.activeTurnId, activeEffectCaption);
      }
    }

    assistantTurnParticipantIdsRef.current = nextEntries;
    assistantTurnCaptionCuesRef.current = nextCaptionEntries;
    assistantTurnEffectCaptionsRef.current = nextEffectCaptionEntries;
  }, [outputPlayback.activeTurnId, turns]);

  useEffect(() => {
    if (!kindroidStageCaptioningEnabled) {
      setActiveSpeechCaption(null);
      setActiveEffectCaption(null);
      return;
    }

    if (!outputPlayback.activeTurnId || outputPlayback.startedAtMs === null) {
      setActiveSpeechCaption(null);
      setActiveEffectCaption(null);
      return;
    }

    let frameId = 0;

    const updateCaption = () => {
      const captionTrack =
        assistantTurnCaptionCuesRef.current.get(outputPlayback.activeTurnId ?? "") ?? null;
      const elapsedMs = Math.max(0, performance.now() - (outputPlayback.startedAtMs ?? 0));
      const captionOffsetMs = outputPlayback.speechOffsetMs ?? captionTrack?.offsetMs ?? 0;
      const captionCues =
        captionTrack?.mode === "estimated"
          ? offsetSpeechCaptionCues(
              scaleSpeechCaptionCues(
                captionTrack.cues,
                Math.max(0, (outputPlayback.durationMs ?? 0) - captionOffsetMs)
              ),
              captionOffsetMs
            )
          : offsetSpeechCaptionCues(captionTrack?.cues ?? [], captionOffsetMs);
      const activeCue = findActiveSpeechCaptionCue(captionCues, elapsedMs);
      const speakerLabel = turns.find(
        (turn) => turn.id === outputPlayback.activeTurnId
      )?.speakerLabel;

      setActiveSpeechCaption((previous) => {
        const nextCaption = activeCue
          ? {
              speakerLabel,
              text: activeCue.text
            }
          : null;

        if (
          previous?.speakerLabel === nextCaption?.speakerLabel &&
          previous?.text === nextCaption?.text
        ) {
          return previous;
        }

        return nextCaption;
      });

      const effectCaption = assistantTurnEffectCaptionsRef.current.get(
        outputPlayback.activeTurnId ?? ""
      );
      const speechOffsetMs =
        outputPlayback.speechOffsetMs && outputPlayback.speechOffsetMs > 0
          ? outputPlayback.speechOffsetMs
          : (effectCaption?.durationMs ?? 0);
      const nextEffectCaption =
        effectCaption && speechOffsetMs > 0 && elapsedMs < speechOffsetMs
          ? effectCaption.text
          : null;
      setActiveEffectCaption((previous) =>
        previous === nextEffectCaption ? previous : nextEffectCaption
      );

      frameId = window.requestAnimationFrame(updateCaption);
    };

    frameId = window.requestAnimationFrame(updateCaption);
    return () => {
      window.cancelAnimationFrame(frameId);
      setActiveSpeechCaption(null);
      setActiveEffectCaption(null);
    };
  }, [
    kindroidStageCaptioningEnabled,
    outputPlayback.activeTurnId,
    outputPlayback.durationMs,
    outputPlayback.speechOffsetMs,
    outputPlayback.startedAtMs,
    turns
  ]);

  const insertPendingUserTurn = useCallback((): void => {
    pendingUserTurnIdRef.current = `pending-user-${crypto.randomUUID()}`;
  }, []);

  const clearPendingUserTurn = useCallback((): void => {
    const pendingId = pendingUserTurnIdRef.current;
    if (!pendingId) {
      return;
    }

    pendingUserTurnIdRef.current = null;
    setTurns((previous) => previous.filter((turn) => turn.id !== pendingId));
  }, []);

  const clearPendingConversationHint = useCallback((): void => {
    setPendingConversationHint(null);
  }, []);

  function clearSettingsFeedbackTimer(): void {
    if (settingsFeedbackTimerRef.current !== null) {
      window.clearTimeout(settingsFeedbackTimerRef.current);
      settingsFeedbackTimerRef.current = null;
    }
  }

  function scheduleSettingsFeedbackReset(): void {
    clearSettingsFeedbackTimer();
    settingsFeedbackTimerRef.current = window.setTimeout(() => {
      settingsFeedbackTimerRef.current = null;
      setSettingsSaveState((previous) => (previous === "saved" ? "idle" : previous));
      setSettingsFeedback("");
    }, 1400);
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

  // This effect intentionally tracks session/config seams rather than every helper it calls.
  // Pulling all transient orchestration callbacks into the dependency list would cause
  // needless reconnects and duplicate subscriptions.
  /* eslint-disable react-hooks/exhaustive-deps */
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
        ttsProvider: effectiveTtsProvider
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
                      label: "OPENAI_TTS_INSTRUCTIONS",
                      present: Boolean(openAiSpeechState.instructions),
                      value: openAiSpeechState.instructions || undefined
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
    } else if (
      mode === "voice" &&
      voiceBackend === "kindroid" &&
      usesKindroidGroupConversation
    ) {
      void Promise.all([
        bridge.openaiAudio.getState(),
        bridge.kindroidExperimental.getState(),
        bridge.elevenlabs.getState(),
        bridge.openaiSpeech.getState()
      ]).then(
        ([openAiState, kindroidExperimentalState, elevenLabsState, openAiSpeechState]) => {
          const groupParticipantCount = activeKindroidGroupParticipants.length;
          const ttsConfigured = !groupKindroidHasAnySpeech
            ? true
            : (!groupKindroidUsesOpenAiSpeech || openAiSpeechState.configured) &&
              (!groupKindroidUsesElevenLabsSpeech || elevenLabsState.configured);
          const isConfigured =
            openAiState.configured &&
            kindroidExperimentalState.enabled &&
            kindroidExperimentalState.configured &&
            Boolean(activeKindroidGroupMirror?.groupId) &&
            groupParticipantCount > 0 &&
            ttsConfigured;

          setConfigured(isConfigured);
          setBackendConfig({
            mode,
            providerLabel: !groupKindroidHasAnySpeech
              ? "Kindroid Group Voice + Text Reply"
              : "Kindroid Group Voice + Participant TTS",
            configured: isConfigured,
            items: [
              {
                label: "Group",
                present: Boolean(activeKindroidGroupMirror),
                value: activeKindroidGroupMirror?.displayName ?? undefined
              },
              {
                label: "GROUP_ID",
                present: Boolean(activeKindroidGroupMirror?.groupId),
                value: activeKindroidGroupMirror?.groupId ?? undefined
              },
              {
                label: "Turn-taking",
                present: Boolean(activeKindroidGroupMirror),
                value: activeKindroidGroupMirror?.manualTurnTaking ? "Manual" : "Automatic"
              },
              {
                label: "Manual speaker",
                present: Boolean(activeKindroidGroupMirror),
                value: activeKindroidGroupMirror?.manualTurnTaking
                  ? "In-chat roster buttons"
                  : "Not required"
              },
              {
                label: "OPENAI_API_KEY",
                present: openAiState.apiKeyPresent
              },
              {
                label: "STT model",
                present: Boolean(openAiState.model),
                value: openAiState.model ?? undefined
              },
              {
                label: "KINDROID_EXPERIMENTAL",
                present: kindroidExperimentalState.enabled
              },
              {
                label: "KINDROID_API_KEY",
                present: kindroidExperimentalState.apiKeyPresent
              },
              ...(!groupKindroidHasAnySpeech
                ? [
                    {
                      label: "Speech output",
                      present: true,
                      value: "Disabled"
                    }
                  ]
                : [
                    ...(groupKindroidUsesOpenAiSpeech
                      ? [
                          {
                            label: "OPENAI_API_KEY (TTS)",
                            present: openAiSpeechState.apiKeyPresent
                          },
                          {
                            label: "TTS model",
                            present: Boolean(openAiSpeechState.model),
                            value: openAiSpeechState.model ?? undefined
                          }
                        ]
                      : []),
                    ...(groupKindroidUsesElevenLabsSpeech
                      ? [
                          {
                            label: "ELEVENLABS_API_KEY",
                            present: elevenLabsState.apiKeyPresent
                          },
                          {
                            label: "TTS model",
                            present: Boolean(elevenLabsState.model),
                            value: elevenLabsState.model
                          }
                        ]
                      : [])
                  ])
            ]
          });
        }
      );
    } else if (mode === "voice" && voiceBackend === "kindroid") {
      void Promise.all([
        bridge.openaiAudio.getState(),
        bridge.kindroid.getState(),
        bridge.elevenlabs.getState(),
        bridge.openaiSpeech.getState()
      ]).then(([openAiState, kindroidState, elevenLabsState, openAiSpeechState]) => {
        const ttsConfigured =
          effectiveKindroidTtsProvider === "none"
            ? true
            : effectiveKindroidTtsProvider === "openai"
              ? openAiSpeechState.configured
              : elevenLabsState.configured;
        const isConfigured =
          openAiState.configured && kindroidState.configured && ttsConfigured;
        setConfigured(isConfigured);
        setBackendConfig({
          mode,
          providerLabel:
            effectiveKindroidTtsProvider === "none"
              ? "Kindroid Voice + Text Reply"
              : effectiveKindroidTtsProvider === "openai"
                ? "Kindroid Voice + OpenAI TTS"
                : "Kindroid Voice + ElevenLabs",
          configured: isConfigured,
          items: [
            {
              label: "Participant",
              present: Boolean(activeKindroidParticipant),
              value: activeKindroidParticipant?.displayName ?? undefined
            },
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
              present: kindroidState.aiIdPresent,
              value: activeKindroidParticipant?.aiId ?? undefined
            },
            ...(effectiveKindroidTtsProvider === "none"
              ? [
                  {
                    label: "Speech output",
                    present: true,
                    value: "Disabled"
                  }
                ]
              : effectiveKindroidTtsProvider === "openai"
                ? [
                    {
                      label: "OPENAI_API_KEY (TTS)",
                      present: openAiSpeechState.apiKeyPresent
                    },
                    {
                      label: "OPENAI_TTS_VOICE",
                      present: Boolean(
                        activeKindroidParticipant?.openAiVoice || openAiSpeechState.voice
                      ),
                      value:
                        activeKindroidParticipant?.openAiVoice ||
                        openAiSpeechState.voice ||
                        undefined
                    },
                    {
                      label: "OPENAI_TTS_INSTRUCTIONS",
                      present: Boolean(
                        activeKindroidParticipant?.openAiInstructions ||
                        openAiSpeechState.instructions
                      ),
                      value:
                        activeKindroidParticipant?.openAiInstructions ||
                        openAiSpeechState.instructions ||
                        undefined
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
                      present: Boolean(
                        activeKindroidParticipant?.elevenLabsVoiceId || elevenLabsState.voiceId
                      ),
                      value:
                        activeKindroidParticipant?.elevenLabsVoiceId ||
                        elevenLabsState.voiceId ||
                        undefined
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
    } else if (textBackend === "kindroid" && usesKindroidGroupConversation) {
      void bridge.kindroidExperimental.getState().then((state) => {
        const isConfigured =
          state.enabled &&
          state.configured &&
          Boolean(activeKindroidGroupMirror?.groupId) &&
          (activeKindroidGroupMirror?.participantIds.length ?? 0) > 0;
        setConfigured(isConfigured);
        setBackendConfig({
          mode,
          providerLabel: "Kindroid Group",
          configured: isConfigured,
          items: [
            {
              label: "Group",
              present: Boolean(activeKindroidGroupMirror),
              value: activeKindroidGroupMirror?.displayName ?? undefined
            },
            {
              label: "GROUP_ID",
              present: Boolean(activeKindroidGroupMirror?.groupId),
              value: activeKindroidGroupMirror?.groupId ?? undefined
            },
            {
              label: "Turn-taking",
              present: Boolean(activeKindroidGroupMirror),
              value: activeKindroidGroupMirror?.manualTurnTaking ? "Manual" : "Automatic"
            },
            {
              label: "Manual speaker",
              present: Boolean(activeKindroidGroupMirror),
              value: activeKindroidGroupMirror?.manualTurnTaking
                ? "In-chat roster buttons"
                : "Not required"
            },
            {
              label: "KINDROID_EXPERIMENTAL",
              present: state.enabled
            },
            {
              label: "KINDROID_API_KEY",
              present: state.apiKeyPresent
            }
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
              label: "Participant",
              present: Boolean(activeKindroidParticipant),
              value: activeKindroidParticipant?.displayName ?? undefined
            },
            {
              label: "KINDROID_API_KEY",
              present: state.apiKeyPresent
            },
            {
              label: "KINDROID_AI_ID",
              present: state.aiIdPresent,
              value: activeKindroidParticipant?.aiId ?? undefined
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
      handleCadenceSessionEvent(event, {
        mode,
        voiceInputMode,
        stagedTextReplyMode,
        kindroidStageCaptioningEnabled,
        hotMicMutedRef,
        poseHoldTimerRef,
        stageTimelineManagedRef,
        pendingUserTurnIdRef,
        bufferedAssistantTurnRef,
        assistantTurnParticipantIdsRef,
        assistantTurnCaptionCuesRef,
        assistantTurnEffectCaptionsRef,
        responseClock,
        clearPlaybackSuppressionTimer,
        suppressHotMicPlayback,
        releaseHotMicSuppression,
        clearPoseHold,
        clearPendingConversationHint,
        clearStageTimeline,
        clearPendingUserTurn,
        updatePerformance,
        beginVisualReplyPrelude,
        beginVisualReplyDelivery,
        getAssistantTurnMetadata,
        scheduleHotMicPlaybackRelease,
        setActiveStateId,
        setStatusCopy,
        setConnectionReady,
        setConfigured,
        setPendingConversationHint,
        setTurns,
        setMetrics,
        setLastMemoryRecall,
        setLastMemoryIngest
      });
    });

    const config =
      mode === "voice"
        ? voiceBackend === "kindroid"
          ? usesKindroidGroupConversation
            ? !groupKindroidHasAnySpeech
              ? {
                  ...defaultKindroidVoiceTextOnlyConfig,
                  kindroidConversationMode,
                  kindroidParticipants: settingsSnapshot?.kindroidParticipants ?? [],
                  kindroidGroupMirror: activeKindroidGroupMirror
                }
              : {
                  ...(groupKindroidUsesOpenAiSpeech && !groupKindroidUsesElevenLabsSpeech
                    ? defaultKindroidVoiceOpenAiTtsConfig
                    : defaultKindroidVoiceTransportConfig),
                  kindroidConversationMode,
                  kindroidParticipants: settingsSnapshot?.kindroidParticipants ?? [],
                  kindroidGroupMirror: activeKindroidGroupMirror
                }
            : effectiveKindroidTtsProvider === "none"
              ? {
                  ...defaultKindroidVoiceTextOnlyConfig,
                  kindroidActiveParticipant: activeKindroidParticipant
                }
              : effectiveKindroidTtsProvider === "openai"
                ? {
                    ...defaultKindroidVoiceOpenAiTtsConfig,
                    kindroidActiveParticipant: activeKindroidParticipant,
                    voice: activeKindroidParticipant?.openAiVoice ?? "",
                    speechInstructions:
                      activeKindroidParticipant?.openAiInstructions || undefined
                  }
                : {
                    ...defaultKindroidVoiceTransportConfig,
                    kindroidActiveParticipant: activeKindroidParticipant,
                    voice: activeKindroidParticipant?.elevenLabsVoiceId ?? ""
                  }
          : voiceBackend === "openai-batch"
            ? ttsProvider === "none"
              ? {
                  ...defaultOpenAiBatchVoiceTextOnlyConfig
                }
              : ttsProvider === "openai"
                ? {
                    ...defaultOpenAiBatchVoiceOpenAiTtsConfig,
                    voice: settingsSnapshot?.openAiTtsVoice ?? "",
                    speechInstructions: settingsSnapshot?.openAiTtsInstructions || undefined
                  }
                : {
                    ...defaultOpenAiBatchVoiceTransportConfig
                  }
            : {
                ...defaultVoiceTransportConfig
              }
        : textBackend === "kindroid" && usesKindroidGroupConversation
          ? {
              ...defaultTextTransportConfig,
              kindroidConversationMode,
              kindroidParticipants: settingsSnapshot?.kindroidParticipants ?? [],
              kindroidGroupMirror: activeKindroidGroupMirror
            }
          : {
              ...defaultTextTransportConfig
            };

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
  }, [
    activeKindroidGroupMirror,
    activeKindroidParticipant,
    activeSession,
    effectiveTtsProvider,
    effectiveKindroidTtsProvider,
    kindroidConversationMode,
    mode,
    settingsSnapshot,
    settingsLoaded,
    settingsRevision,
    stagedTextReplyMode,
    textBackend,
    ttsProvider,
    usesKindroidGroupConversation,
    voiceBackend,
    voiceInputMode
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const { startRecording, stopRecording, submitText } = useCadenceInputOrchestrator({
    activeSession,
    mode,
    voiceBackend,
    voiceInputMode,
    textBackend,
    effectiveTtsProvider,
    hotMicMuted,
    interactionReady,
    isRecording,
    inputText,
    turns,
    stagedTextReplyMode,
    recorderRef,
    hotMicRecorderRef,
    assistantSpeakingRef,
    hotMicMutedRef,
    responseClock,
    clearPendingConversationHint,
    insertPendingUserTurn,
    clearPendingUserTurn,
    clearStageTimeline,
    updatePerformance,
    beginVisualReplyPrelude,
    setConfigured,
    setIsRecording,
    setInputText,
    setStatusCopy,
    setActiveStateId,
    setMetrics
  });

  async function playKindroidGreeting(turnId: string, text: string): Promise<void> {
    const usesSpokenKindroidGreeting =
      mode === "voice" &&
      voiceBackend === "kindroid" &&
      !usesKindroidGroupConversation &&
      effectiveKindroidTtsProvider !== "none";

    if (!usesSpokenKindroidGreeting) {
      return;
    }

    const bridge = getCadenceBridge();
    const synthesis =
      effectiveKindroidTtsProvider === "openai"
        ? await bridge.openaiSpeech.synthesize(text, {
            voice: activeKindroidParticipant?.openAiVoice || undefined,
            instructions: activeKindroidParticipant?.openAiInstructions || undefined
          })
        : await bridge.elevenlabs.synthesize(text, {
            voiceId: activeKindroidParticipant?.elevenLabsVoiceId || undefined
          });

    await activeSession.playAssistantAudioChunk({
      type: "assistant.audio.chunk",
      turnId,
      sequence: 0,
      format: synthesis.format,
      data: synthesis.audio,
      captions: synthesis.captions,
      captionsMode: synthesis.captionsMode
    });
  }

  async function startNewChat(greeting: string): Promise<void> {
    const usesKindroid =
      (mode === "voice" && voiceBackend === "kindroid") ||
      (mode === "text" && textBackend === "kindroid");

    if (!usesKindroid) {
      throw new Error("Chat Break is only available when Kindroid is the active backend.");
    }

    if (usesKindroidGroupConversation) {
      throw new Error("Chat Break is only available for solo Kindroid conversations.");
    }

    if (!settingsSnapshot) {
      throw new Error("Settings are still loading.");
    }

    if (newChatPending) {
      throw new Error("A chat break is already in progress.");
    }

    const nextGreeting = greeting || "Hello.";
    const assistantTurnId = crypto.randomUUID();

    setNewChatPending(true);
    setStatusCopy("Running Kindroid chat break...");

    try {
      await activeSession.interrupt();
      clearPendingConversationHint();
      assistantTurnParticipantIdsRef.current.clear();
      assistantTurnEffectCaptionsRef.current.clear();
      await getCadenceBridge().kindroid.chatBreak(nextGreeting);
      clearPlaybackSuppressionTimer();
      releaseHotMicSuppression();
      clearStageTimeline();
      clearPendingUserTurn();
      bufferedAssistantTurnRef.current = null;
      setInputText("");
      setTurns([
        {
          id: assistantTurnId,
          speaker: "assistant",
          ...getAssistantTurnMetadata(),
          timestamp: timestampNow(),
          text: nextGreeting
        }
      ]);
      beginVisualReplyDelivery(nextGreeting);

      try {
        await playKindroidGreeting(assistantTurnId, nextGreeting);
        scheduleHotMicPlaybackRelease(nextGreeting);
        setStatusCopy("Chat break complete.");
      } catch (error) {
        const message =
          error instanceof Error
            ? `Chat break complete, but speech playback failed: ${error.message}`
            : "Chat break complete, but speech playback failed.";
        setStatusCopy(message);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to run the Kindroid chat break.";
      setStatusCopy(message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setNewChatPending(false);
    }
  }

  async function saveSettings(update: Omit<SettingsUpdate, "preferences">): Promise<void> {
    const bridge = getCadenceBridge();

    clearSettingsFeedbackTimer();
    setSettingsSaveState("saving");
    setSettingsFeedback("Saving settings...");

    try {
      const snapshot = await bridge.settings.update({
        ...update,
        preferences: {
          mode,
          textBackend,
          ttsProvider,
          voiceInputMode,
          voiceBackend
        }
      });

      setSettingsSnapshot(snapshot);
      setSettingsSaveState("saved");
      setSettingsFeedback("Saved.");
      setSettingsRevision((previous) => previous + 1);
      scheduleSettingsFeedbackReset();
    } catch (error) {
      clearSettingsFeedbackTimer();
      setSettingsSaveState("error");
      setSettingsFeedback(error instanceof Error ? error.message : "Failed to save settings.");
    }
  }

  async function saveKindroidConfig(update: {
    kindroidConversationMode: SettingsSnapshot["kindroidConversationMode"];
    kindroidParticipants: SettingsSnapshot["kindroidParticipants"];
    activeKindroidParticipantId: string | null;
    kindroidGroupMirrors: SettingsSnapshot["kindroidGroupMirrors"];
    activeKindroidGroupMirrorId: string | null;
    activeKindroidGroupSpeakerParticipantId: string | null;
  }): Promise<void> {
    if (!settingsSnapshot) {
      throw new Error("Settings are still loading.");
    }

    await saveSettings({
      openAiTtsVoice: settingsSnapshot.openAiTtsVoice,
      openAiTtsInstructions: settingsSnapshot.openAiTtsInstructions,
      memoryBaseUrl: settingsSnapshot.memoryBaseUrl,
      elevenLabsVoiceId: settingsSnapshot.elevenLabsVoiceId,
      kindroidAiId: settingsSnapshot.kindroidAiId,
      kindroidBaseUrl: settingsSnapshot.kindroidBaseUrl,
      kindroidGreeting: settingsSnapshot.kindroidGreeting,
      kindroidConversationMode: update.kindroidConversationMode,
      kindroidParticipants: update.kindroidParticipants,
      activeKindroidParticipantId: update.activeKindroidParticipantId,
      kindroidGroupMirrors: update.kindroidGroupMirrors,
      activeKindroidGroupMirrorId: update.activeKindroidGroupMirrorId,
      activeKindroidGroupSpeakerParticipantId: update.activeKindroidGroupSpeakerParticipantId
    });
  }

  async function requestKindroidGroupParticipantTurn(participantId: string): Promise<void> {
    if (!usesKindroidGroupConversation || !activeKindroidGroupMirror) {
      throw new Error("Direct participant turns are only available in Kindroid group mode.");
    }

    const participant = activeKindroidGroupParticipants.find(
      (candidate) => candidate.id === participantId
    );
    if (!participant) {
      throw new Error("The selected Kindroid participant is not part of the active group.");
    }
    if (pendingConversationHint?.kind !== "user") {
      throw new Error("Wait until the group returns the turn before choosing a Kin.");
    }

    clearPendingConversationHint();
    responseClock.current.startedAt = performance.now();
    responseClock.current.firstAudioAt = null;
    setStatusCopy(`${participant.bubbleName} is thinking...`);
    try {
      await activeSession.requestKindroidGroupParticipantTurn(participantId);
    } catch (error) {
      setPendingConversationHint({
        kind: "user",
        message: activeKindroidGroupMirror.manualTurnTaking
          ? "Choose who replies next."
          : "Your turn."
      });
      throw error;
    }
  }

  async function takeBackKindroidGroupTurn(): Promise<void> {
    if (!usesKindroidGroupConversation || activeKindroidGroupMirror?.manualTurnTaking) {
      throw new Error(
        "Take Turn Back is only available during automatic Kindroid group turns."
      );
    }

    if (pendingConversationHint?.kind === "user") {
      return;
    }

    setStatusCopy("Taking the turn back...");
    await activeSession.interrupt();
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
    activeSpeechCaption,
    activeEffectCaption,
    activeKindroidGroupMirror,
    activeKindroidGroupParticipants,
    activeKindroidParticipant,
    activeWaveformKindroidParticipant,
    configured,
    connectionReady,
    composerPlaceholder:
      pendingConversationHint?.kind === "user"
        ? pendingConversationHint.message === "Your turn."
          ? "Kindroid is waiting for your turn."
          : pendingConversationHint.message
        : undefined,
    hotMicMuted,
    inputText,
    isRecording,
    metrics,
    lastMemoryIngest,
    mode,
    lastMemoryRecall,
    newChatPending,
    backendConfig,
    pendingAssistantHint:
      pendingConversationHint?.kind === "assistant" ? pendingConversationHint : null,
    pendingSceneBreakLabel:
      usesKindroidGroupConversation && pendingConversationHint?.kind === "user"
        ? pendingConversationHint.message
        : null,
    requestKindroidGroupParticipantTurn,
    saveSettings,
    saveKindroidConfig,
    settingsFeedback,
    settingsLoaded,
    settingsSaveState,
    settingsSnapshot,
    kindroidConversationMode,
    kindroidAwaitingUserTurn: pendingConversationHint?.kind === "user",
    kindroidAutoTurnInProgress:
      usesKindroidGroupConversation &&
      !activeKindroidGroupMirror?.manualTurnTaking &&
      pendingConversationHint?.kind === "assistant",
    usesKindroidGroupConversation,
    voiceBackend,
    voiceInputMode,
    setInputText,
    setMode,
    setTextBackend,
    setTtsProvider,
    setVoiceInputMode,
    setVoiceBackend,
    setHotMicMuted,
    startRecording,
    statusCopy,
    stopRecording,
    startNewChat,
    submitText,
    takeBackKindroidGroupTurn,
    textBackend,
    ttsProvider,
    effectiveTtsProvider,
    topology,
    turns
  };
}
