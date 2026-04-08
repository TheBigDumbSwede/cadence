import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import type { PresenceDirective } from "../../shared/performance-directive";
import type { PreviewAssistantStateId } from "../../shared/assistant-state";
import type { ConversationMetrics, ConversationTurn } from "../../shared/conversation-types";
import type { InteractionMode } from "../../shared/interaction-mode";
import type { TextBackendProvider } from "../../shared/backend-provider";
import type { TtsProvider } from "../../shared/tts-provider";
import type { VoiceBackendProvider } from "../../shared/voice-backend";
import type { VoiceInputMode } from "../../shared/voice-input-mode";
import { toAppError } from "../../shared/app-error";
import { createPerformanceDirective } from "../../services/stage/performanceHeuristics";
import {
  HotMicRecorder,
  PushToTalkRecorder,
  type HotMicMonitorState
} from "../../services/audio/audioCapture";
import type { CadenceSession } from "../../services/CadenceSession";
import { buildSubmitStatusCopy } from "./statusCopy";

type ResponseClockRef = MutableRefObject<{
  startedAt: number | null;
  firstAudioAt: number | null;
  interruptionStartedAt: number | null;
}>;

type UseCadenceInputOrchestratorArgs = {
  activeSession: CadenceSession;
  mode: InteractionMode;
  voiceBackend: VoiceBackendProvider;
  voiceInputMode: VoiceInputMode;
  textBackend: TextBackendProvider;
  effectiveTtsProvider: TtsProvider;
  hotMicMuted: boolean;
  interactionReady: boolean;
  isRecording: boolean;
  inputText: string;
  turns: ConversationTurn[];
  stagedTextReplyMode: boolean;
  recorderRef: MutableRefObject<PushToTalkRecorder | null>;
  hotMicRecorderRef: MutableRefObject<HotMicRecorder | null>;
  assistantSpeakingRef: MutableRefObject<boolean>;
  hotMicMutedRef: MutableRefObject<boolean>;
  responseClock: ResponseClockRef;
  clearPendingConversationHint: () => void;
  insertPendingUserTurn: () => void;
  clearPendingUserTurn: () => void;
  clearStageTimeline: () => void;
  updatePerformance: (
    directive: PresenceDirective,
    options?: {
      retriggerGesture?: boolean;
    }
  ) => void;
  beginVisualReplyPrelude: (text: string) => void;
  setConfigured: Dispatch<SetStateAction<boolean>>;
  setIsRecording: Dispatch<SetStateAction<boolean>>;
  setInputText: Dispatch<SetStateAction<string>>;
  setStatusCopy: Dispatch<SetStateAction<string>>;
  setActiveStateId: Dispatch<SetStateAction<PreviewAssistantStateId>>;
  setMetrics: Dispatch<SetStateAction<ConversationMetrics>>;
};

export function useCadenceInputOrchestrator({
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
}: UseCadenceInputOrchestratorArgs): {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  submitText: () => Promise<void>;
} {
  const handleSessionActionError = useCallback(
    (error: unknown, fallbackMessage: string): void => {
      const appError = toAppError(error, {
        code: "unknown",
        message: fallbackMessage,
        retryable: true
      });
      setStatusCopy(appError.message);
      if (appError.code.startsWith("config.")) {
        setConfigured(false);
      }
    },
    [setConfigured, setStatusCopy]
  );

  useEffect(() => {
    recorderRef.current = new PushToTalkRecorder();
    hotMicRecorderRef.current = new HotMicRecorder();
  }, [hotMicRecorderRef, recorderRef]);

  useEffect(() => {
    hotMicMutedRef.current = hotMicMuted;
    hotMicRecorderRef.current?.setSuppressed(hotMicMuted || assistantSpeakingRef.current);
  }, [assistantSpeakingRef, hotMicMuted, hotMicMutedRef, hotMicRecorderRef]);

  useEffect(() => {
    const hotMicRecorder = hotMicRecorderRef.current;
    if (!hotMicRecorder) {
      return;
    }

    if (mode !== "voice" || voiceInputMode !== "hot_mic" || !interactionReady) {
      void hotMicRecorder.stop();
      return;
    }

    let cancelled = false;

    void hotMicRecorder.start({
      onSpeechStart: () => {
        if (cancelled) {
          return;
        }

        clearPendingConversationHint();
        responseClock.current.interruptionStartedAt = performance.now();
        if (assistantSpeakingRef.current) {
          void activeSession.interrupt();
        }
        clearStageTimeline();
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
            if (!assistantSpeakingRef.current && interactionReady) {
              setStatusCopy(
                hotMicMutedRef.current ? "Hot mic is paused." : "Hot mic is armed."
              );
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
  }, [
    activeSession,
    assistantSpeakingRef,
    clearPendingConversationHint,
    clearStageTimeline,
    hotMicMutedRef,
    hotMicRecorderRef,
    insertPendingUserTurn,
    interactionReady,
    mode,
    responseClock,
    setActiveStateId,
    setMetrics,
    setStatusCopy,
    updatePerformance,
    voiceInputMode
  ]);

  const startRecording = useCallback(async (): Promise<void> => {
    if (
      mode !== "voice" ||
      voiceInputMode !== "push_to_talk" ||
      isRecording ||
      !interactionReady ||
      !recorderRef.current
    ) {
      return;
    }

    clearPendingConversationHint();
    responseClock.current.interruptionStartedAt = performance.now();
    try {
      if (assistantSpeakingRef.current) {
        await activeSession.interrupt();
      }
      await recorderRef.current.start();
      setIsRecording(true);
      clearStageTimeline();
      setActiveStateId("listening");
      setStatusCopy("Listening...");
    } catch (error) {
      handleSessionActionError(error, "Failed to start recording.");
    }
  }, [
    activeSession,
    assistantSpeakingRef,
    clearPendingConversationHint,
    clearStageTimeline,
    handleSessionActionError,
    interactionReady,
    isRecording,
    mode,
    recorderRef,
    responseClock,
    setActiveStateId,
    setIsRecording,
    setStatusCopy,
    voiceInputMode
  ]);

  const stopRecording = useCallback(async (): Promise<void> => {
    if (
      mode !== "voice" ||
      voiceInputMode !== "push_to_talk" ||
      !isRecording ||
      !recorderRef.current
    ) {
      return;
    }

    try {
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
    } catch (error) {
      setIsRecording(false);
      handleSessionActionError(error, "Failed to stop recording.");
    }
  }, [
    activeSession,
    clearPendingUserTurn,
    handleSessionActionError,
    insertPendingUserTurn,
    isRecording,
    mode,
    recorderRef,
    responseClock,
    setActiveStateId,
    setIsRecording,
    setMetrics,
    setStatusCopy,
    voiceInputMode
  ]);

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
  }, [mode, startRecording, stopRecording, voiceInputMode]);

  const submitText = useCallback(async (): Promise<void> => {
    if (!inputText.trim()) {
      return;
    }

    clearPendingConversationHint();
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
        ttsProvider: effectiveTtsProvider
      })
    );
    try {
      await activeSession.sendUserText(
        text,
        turns.map((turn) => ({
          speaker: turn.speaker,
          text: turn.text
        }))
      );
    } catch (error) {
      handleSessionActionError(error, "Failed to submit text.");
    }
  }, [
    activeSession,
    beginVisualReplyPrelude,
    clearPendingConversationHint,
    effectiveTtsProvider,
    handleSessionActionError,
    inputText,
    mode,
    responseClock,
    setInputText,
    setStatusCopy,
    stagedTextReplyMode,
    textBackend,
    turns,
    voiceBackend
  ]);

  return {
    startRecording,
    stopRecording,
    submitText
  };
}
