import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import type { PresenceSnapshot } from "../../shared/performance-directive";
import type { PreviewAssistantStateId } from "../../shared/assistant-state";
import type { InteractionMode } from "../../shared/interaction-mode";
import type { KindroidParticipant } from "../../shared/kindroid-participants";
import type { TtsProvider } from "../../shared/tts-provider";
import type { VoiceBackendProvider } from "../../shared/voice-backend";
import type { VoiceInputMode } from "../../shared/voice-input-mode";
import type { HotMicRecorder } from "../../services/audio/audioCapture";
import {
  createPerformanceDirective,
  inferPerformanceDirective
} from "../../services/stage/performanceHeuristics";
import { stripKindroidNarrationForSpeech } from "../../services/transports/kindroid/speechText";
import {
  estimateAssistantDeliveryMs,
  estimateAssistantReadMs,
  estimateUserReadMs
} from "./timing";
import { snapshotFromDirective } from "./performance";

type UseCadenceStageOrchestratorArgs = {
  mode: InteractionMode;
  voiceBackend: VoiceBackendProvider;
  voiceInputMode: VoiceInputMode;
  ttsProvider: TtsProvider;
  effectiveKindroidTtsProvider: TtsProvider;
  connectionReady: boolean;
  stagedTextReplyMode: boolean;
  activeKindroidParticipant: KindroidParticipant | null;
  usesKindroidGroupConversation: boolean;
  kindroidParticipants: KindroidParticipant[];
  hotMicRecorderRef: MutableRefObject<HotMicRecorder | null>;
  hotMicMutedRef: MutableRefObject<boolean>;
  setStatusCopy: Dispatch<SetStateAction<string>>;
  setActiveStateId: Dispatch<SetStateAction<PreviewAssistantStateId>>;
  setPresenceSnapshot: Dispatch<SetStateAction<PresenceSnapshot>>;
};

type UseCadenceStageOrchestratorResult = {
  assistantSpeakingRef: MutableRefObject<boolean>;
  poseHoldTimerRef: MutableRefObject<number | null>;
  stageTimelineManagedRef: MutableRefObject<boolean>;
  updatePerformance: (
    directive: Parameters<typeof snapshotFromDirective>[0],
    options?: {
      retriggerGesture?: boolean;
    }
  ) => void;
  clearPoseHold: () => void;
  clearStageTimeline: () => void;
  clearPlaybackSuppressionTimer: () => void;
  suppressHotMicPlayback: () => void;
  releaseHotMicSuppression: () => void;
  scheduleHotMicPlaybackRelease: (text: string, kindroidParticipantId?: string) => void;
  beginVisualReplyPrelude: (text: string) => void;
  beginVisualReplyDelivery: (text: string) => void;
};

export function useCadenceStageOrchestrator({
  mode,
  voiceBackend,
  voiceInputMode,
  ttsProvider,
  effectiveKindroidTtsProvider,
  connectionReady,
  stagedTextReplyMode,
  activeKindroidParticipant,
  usesKindroidGroupConversation,
  kindroidParticipants,
  hotMicRecorderRef,
  hotMicMutedRef,
  setStatusCopy,
  setActiveStateId,
  setPresenceSnapshot
}: UseCadenceStageOrchestratorArgs): UseCadenceStageOrchestratorResult {
  const assistantSpeakingRef = useRef(false);
  const playbackSuppressionTimerRef = useRef<number | null>(null);
  const poseHoldTimerRef = useRef<number | null>(null);
  const stagePhaseTimerRef = useRef<number | null>(null);
  const stageTimelineManagedRef = useRef(false);

  const clearStagePhaseTimer = useCallback((): void => {
    if (stagePhaseTimerRef.current !== null) {
      window.clearTimeout(stagePhaseTimerRef.current);
      stagePhaseTimerRef.current = null;
    }
  }, []);

  const clearPoseHold = useCallback((): void => {
    if (poseHoldTimerRef.current !== null) {
      window.clearTimeout(poseHoldTimerRef.current);
      poseHoldTimerRef.current = null;
    }
  }, []);

  const clearStageTimeline = useCallback((): void => {
    clearPoseHold();
    clearStagePhaseTimer();
    stageTimelineManagedRef.current = false;
  }, [clearPoseHold, clearStagePhaseTimer]);

  const clearPlaybackSuppressionTimer = useCallback((): void => {
    if (playbackSuppressionTimerRef.current !== null) {
      window.clearTimeout(playbackSuppressionTimerRef.current);
      playbackSuppressionTimerRef.current = null;
    }
  }, []);

  const releaseHotMicSuppression = useCallback((): void => {
    assistantSpeakingRef.current = false;
    hotMicRecorderRef.current?.setSuppressed(hotMicMutedRef.current);
  }, [hotMicMutedRef, hotMicRecorderRef]);

  const suppressHotMicPlayback = useCallback((): void => {
    assistantSpeakingRef.current = true;
    hotMicRecorderRef.current?.setSuppressed(true);
  }, [hotMicRecorderRef]);

  const updatePerformance = useCallback(
    (
      directive: Parameters<typeof snapshotFromDirective>[0],
      options?: {
        retriggerGesture?: boolean;
      }
    ): void => {
      setPresenceSnapshot((previous) => snapshotFromDirective(directive, previous, options));
    },
    [setPresenceSnapshot]
  );

  const holdPoseState = useCallback(
    (state: PreviewAssistantStateId, durationMs = 1100): void => {
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
    },
    [clearPoseHold, setActiveStateId, updatePerformance]
  );

  const beginVisualReplyPrelude = useCallback(
    (text: string): void => {
      clearStageTimeline();
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
    },
    [clearStageTimeline, setActiveStateId, updatePerformance]
  );

  const beginVisualReplyDelivery = useCallback(
    (text: string): void => {
      const directive = inferPerformanceDirective(text);
      clearStagePhaseTimer();
      stageTimelineManagedRef.current = true;
      updatePerformance(directive, { retriggerGesture: true });
      holdPoseState(
        "speaking",
        stagedTextReplyMode
          ? estimateAssistantReadMs(text)
          : estimateAssistantDeliveryMs(text, directive.pace)
      );
    },
    [clearStagePhaseTimer, holdPoseState, stagedTextReplyMode, updatePerformance]
  );

  const shouldSpeakAssistantTurn = useCallback(
    (kindroidParticipantId?: string): boolean => {
      if (mode !== "voice") {
        return false;
      }

      if (voiceBackend === "openai") {
        return true;
      }

      if (voiceBackend === "openai-batch") {
        return ttsProvider !== "none";
      }

      if (usesKindroidGroupConversation) {
        const speakingParticipant =
          kindroidParticipants.find(
            (participant) => participant.id === kindroidParticipantId
          ) ?? null;

        return (speakingParticipant?.ttsProvider ?? "none") !== "none";
      }

      return effectiveKindroidTtsProvider !== "none";
    },
    [
      effectiveKindroidTtsProvider,
      kindroidParticipants,
      mode,
      ttsProvider,
      usesKindroidGroupConversation,
      voiceBackend
    ]
  );

  const scheduleHotMicPlaybackRelease = useCallback(
    (text: string, kindroidParticipantId?: string): void => {
      const speakingParticipant =
        voiceBackend === "kindroid"
          ? usesKindroidGroupConversation
            ? (kindroidParticipants.find(
                (participant) => participant.id === kindroidParticipantId
              ) ?? null)
            : activeKindroidParticipant
          : null;
      const speechText =
        voiceBackend === "kindroid"
          ? stripKindroidNarrationForSpeech(text, {
              enabled: speakingParticipant?.filterNarrationForTts ?? true,
              delimiter: speakingParticipant?.narrationDelimiter || "*"
            })
          : text.trim();

      if (
        mode !== "voice" ||
        voiceInputMode !== "hot_mic" ||
        !speechText ||
        !shouldSpeakAssistantTurn(kindroidParticipantId)
      ) {
        return;
      }

      clearPlaybackSuppressionTimer();
      const directive = inferPerformanceDirective(speechText);
      const releaseInMs = estimateAssistantDeliveryMs(speechText, directive.pace) + 450;
      suppressHotMicPlayback();
      playbackSuppressionTimerRef.current = window.setTimeout(() => {
        playbackSuppressionTimerRef.current = null;
        releaseHotMicSuppression();
        if (connectionReady) {
          setStatusCopy("Hot mic is armed.");
        }
      }, releaseInMs);
    },
    [
      activeKindroidParticipant,
      clearPlaybackSuppressionTimer,
      connectionReady,
      kindroidParticipants,
      mode,
      releaseHotMicSuppression,
      setStatusCopy,
      shouldSpeakAssistantTurn,
      suppressHotMicPlayback,
      usesKindroidGroupConversation,
      voiceBackend,
      voiceInputMode
    ]
  );

  useEffect(
    () => () => {
      clearPoseHold();
      clearStagePhaseTimer();
      clearPlaybackSuppressionTimer();
    },
    [clearPlaybackSuppressionTimer, clearPoseHold, clearStagePhaseTimer]
  );

  return {
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
  };
}
