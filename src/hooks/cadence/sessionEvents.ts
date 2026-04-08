import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PreviewAssistantStateId } from "../../shared/assistant-state";
import type { ConversationMetrics, ConversationTurn } from "../../shared/conversation-types";
import type { PresenceDirective } from "../../shared/performance-directive";
import type { VoiceInputMode } from "../../shared/voice-input-mode";
import type { CadenceEvent } from "../../shared/voice-events";
import type { SpeechCaptionCue, SpeechCaptionMode } from "../../shared/speech-captions";
import {
  createPerformanceDirective,
  inferPerformanceDirective
} from "../../services/stage/performanceHeuristics";
import { buildListeningStatusCopy, buildReadyStatusCopy } from "./statusCopy";
import { appendOrUpdateAssistantTurn, isBenignInterruptError } from "./turns";
import { timestampNow } from "./timing";

export type PendingConversationHint =
  | {
      kind: "assistant";
      kindroidParticipantId?: string;
      speakerLabel: string;
      message: string;
    }
  | {
      kind: "user";
      message: string;
    };

export type TurnCaptionTrack = {
  cues: SpeechCaptionCue[];
  mode: SpeechCaptionMode;
  offsetMs: number;
};

export type TurnEffectCaptionTrack = {
  text: string;
  durationMs: number;
};

type BufferedAssistantTurn = {
  turnId: string;
  text: string;
  speakerLabel?: string;
  kindroidParticipantId?: string;
};

type ResponseClockRef = MutableRefObject<{
  startedAt: number | null;
  firstAudioAt: number | null;
  interruptionStartedAt: number | null;
}>;

type SessionEventContext = {
  mode: "voice" | "text";
  voiceInputMode: VoiceInputMode;
  stagedTextReplyMode: boolean;
  kindroidStageCaptioningEnabled: boolean;
  hotMicMutedRef: MutableRefObject<boolean>;
  poseHoldTimerRef: MutableRefObject<number | null>;
  stageTimelineManagedRef: MutableRefObject<boolean>;
  pendingUserTurnIdRef: MutableRefObject<string | null>;
  bufferedAssistantTurnRef: MutableRefObject<BufferedAssistantTurn | null>;
  assistantTurnParticipantIdsRef: MutableRefObject<Map<string, string>>;
  assistantTurnCaptionCuesRef: MutableRefObject<Map<string, TurnCaptionTrack>>;
  assistantTurnEffectCaptionsRef: MutableRefObject<Map<string, TurnEffectCaptionTrack>>;
  responseClock: ResponseClockRef;
  clearPlaybackSuppressionTimer: () => void;
  suppressHotMicPlayback: () => void;
  releaseHotMicSuppression: () => void;
  clearPoseHold: () => void;
  clearPendingConversationHint: () => void;
  clearStageTimeline: () => void;
  clearPendingUserTurn: () => void;
  updatePerformance: (
    directive: PresenceDirective,
    options?: {
      retriggerGesture?: boolean;
    }
  ) => void;
  beginVisualReplyPrelude: (text: string) => void;
  beginVisualReplyDelivery: (text: string) => void;
  getAssistantTurnMetadata: () => {
    speakerLabel?: string;
    kindroidParticipantId?: string;
  };
  scheduleHotMicPlaybackRelease: (text: string, kindroidParticipantId?: string) => void;
  setActiveStateId: Dispatch<SetStateAction<PreviewAssistantStateId>>;
  setStatusCopy: Dispatch<SetStateAction<string>>;
  setConnectionReady: Dispatch<SetStateAction<boolean>>;
  setConfigured: Dispatch<SetStateAction<boolean>>;
  setPendingConversationHint: Dispatch<SetStateAction<PendingConversationHint | null>>;
  setTurns: Dispatch<SetStateAction<ConversationTurn[]>>;
  setMetrics: Dispatch<SetStateAction<ConversationMetrics>>;
  setLastMemoryRecall: Dispatch<
    SetStateAction<{
      provider: string;
      contextBlock: string;
    } | null>
  >;
  setLastMemoryIngest: Dispatch<
    SetStateAction<{
      provider: string;
      written: number;
      updated: number;
      ignored: number;
    } | null>
  >;
};

function buildListeningDirective(cue: "listening" | "interrupted"): PresenceDirective {
  return createPerformanceDirective({
    mood: "focused",
    gesture: "none",
    intensity: cue === "interrupted" ? 0.25 : 0.24,
    pace: "steady",
    cue
  });
}

function buildThinkingDirective(): PresenceDirective {
  return createPerformanceDirective({
    mood: "focused",
    gesture: "thinking_touch",
    intensity: 0.28,
    pace: "calm",
    cue: "thinking"
  });
}

function buildReadyDirective(): PresenceDirective {
  return createPerformanceDirective({
    mood: "neutral",
    gesture: "none",
    intensity: 0.26,
    pace: "steady",
    cue: "ready"
  });
}

function buildErrorDirective(): PresenceDirective {
  return createPerformanceDirective({
    mood: "concerned",
    gesture: "small_shrug",
    intensity: 0.36,
    pace: "calm",
    cue: "error",
    source: "default"
  });
}

function buildUserTurnDirective(): PresenceDirective {
  return createPerformanceDirective({
    mood: "focused",
    gesture: "thinking_touch",
    intensity: 0.3,
    pace: "calm",
    cue: "user-turn"
  });
}

export function handleCadenceSessionEvent(
  event: CadenceEvent,
  context: SessionEventContext
): void {
  switch (event.type) {
    case "session.status":
      handleSessionStatus(event, context);
      break;
    case "transcript.final":
      handleTranscriptFinal(event, context);
      break;
    case "assistant.response.delta":
      handleAssistantDelta(event, context);
      break;
    case "assistant.response.completed":
      handleAssistantCompleted(event, context);
      break;
    case "conversation.turn.pending":
      handlePendingTurn(event, context);
      break;
    case "assistant.audio.chunk":
      handleAssistantAudioChunk(event, context);
      break;
    case "assistant.audio.effect":
      break;
    case "assistant.interrupted":
      handleAssistantInterrupted(context);
      break;
    case "transport.error":
      handleTransportError(event, context);
      break;
    case "memory.recall":
      context.setLastMemoryRecall({
        provider: event.provider,
        contextBlock: event.contextBlock
      });
      break;
    case "memory.ingest":
      context.setLastMemoryIngest({
        provider: event.provider,
        written: event.written,
        updated: event.updated,
        ignored: event.ignored
      });
      break;
    default:
      break;
  }
}

function handleSessionStatus(
  event: Extract<CadenceEvent, { type: "session.status" }>,
  context: SessionEventContext
): void {
  switch (event.status) {
    case "listening":
      context.clearPlaybackSuppressionTimer();
      context.releaseHotMicSuppression();
      context.clearPoseHold();
      context.setActiveStateId("listening");
      context.updatePerformance(buildListeningDirective("listening"));
      break;
    case "connecting":
    case "thinking":
      context.clearPlaybackSuppressionTimer();
      context.releaseHotMicSuppression();
      if (context.stagedTextReplyMode && context.stageTimelineManagedRef.current) {
        break;
      }
      context.clearPoseHold();
      context.setActiveStateId("thinking");
      context.updatePerformance(buildThinkingDirective());
      break;
    case "speaking":
      if (context.voiceInputMode === "hot_mic") {
        context.suppressHotMicPlayback();
      }
      if (context.stagedTextReplyMode) {
        break;
      }
      context.clearPoseHold();
      context.setActiveStateId("speaking");
      break;
    case "ready":
      if (context.voiceInputMode !== "hot_mic") {
        context.releaseHotMicSuppression();
      }
      if (!context.poseHoldTimerRef.current && !context.stageTimelineManagedRef.current) {
        context.setActiveStateId("idle");
      }
      if (!context.stagedTextReplyMode && !context.stageTimelineManagedRef.current) {
        context.updatePerformance(buildReadyDirective());
      }
      context.setConnectionReady(true);
      context.setConfigured(true);
      context.setStatusCopy(
        buildReadyStatusCopy({
          mode: context.mode,
          voiceInputMode: context.voiceInputMode,
          hotMicMuted: context.hotMicMutedRef.current
        })
      );
      break;
    case "disconnected":
      context.clearPendingConversationHint();
      context.clearPlaybackSuppressionTimer();
      context.assistantTurnParticipantIdsRef.current.clear();
      context.releaseHotMicSuppression();
      context.clearStageTimeline();
      context.setActiveStateId("idle");
      context.updatePerformance(createPerformanceDirective());
      context.setConnectionReady(false);
      break;
    default:
      break;
  }
}

function handleTranscriptFinal(
  event: Extract<CadenceEvent, { type: "transcript.final" }>,
  context: SessionEventContext
): void {
  context.clearPendingConversationHint();
  if (context.stagedTextReplyMode) {
    if (!context.stageTimelineManagedRef.current) {
      context.beginVisualReplyPrelude(event.text);
    }
  } else {
    context.updatePerformance(buildUserTurnDirective());
  }

  context.setTurns((previous) => {
    const pendingId = context.pendingUserTurnIdRef.current;
    let nextTurns = previous;
    if (pendingId) {
      context.pendingUserTurnIdRef.current = null;
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

    const bufferedAssistantTurn = context.bufferedAssistantTurnRef.current;
    if (bufferedAssistantTurn) {
      context.bufferedAssistantTurnRef.current = null;
      const assistantMetadata = context.getAssistantTurnMetadata();
      nextTurns = appendOrUpdateAssistantTurn(
        nextTurns,
        bufferedAssistantTurn.turnId,
        bufferedAssistantTurn.text,
        "replace",
        {
          speakerLabel: bufferedAssistantTurn.speakerLabel ?? assistantMetadata.speakerLabel,
          kindroidParticipantId:
            bufferedAssistantTurn.kindroidParticipantId ??
            assistantMetadata.kindroidParticipantId
        }
      );
    }

    return nextTurns;
  });
}

function handleAssistantDelta(
  event: Extract<CadenceEvent, { type: "assistant.response.delta" }>,
  context: SessionEventContext
): void {
  context.clearPendingConversationHint();
  const baseMetadata = context.getAssistantTurnMetadata();
  const assistantTurnMetadata = {
    ...baseMetadata,
    speakerLabel: event.speakerLabel ?? baseMetadata.speakerLabel,
    kindroidParticipantId: event.kindroidParticipantId ?? baseMetadata.kindroidParticipantId
  };

  if (assistantTurnMetadata.kindroidParticipantId) {
    context.assistantTurnParticipantIdsRef.current.set(
      event.turnId,
      assistantTurnMetadata.kindroidParticipantId
    );
  }

  if (context.stagedTextReplyMode) {
    context.beginVisualReplyDelivery(event.text);
  }

  if (context.pendingUserTurnIdRef.current) {
    const buffered = context.bufferedAssistantTurnRef.current;
    context.bufferedAssistantTurnRef.current =
      buffered && buffered.turnId === event.turnId
        ? {
            turnId: event.turnId,
            text: buffered.text + event.text,
            speakerLabel: buffered.speakerLabel ?? assistantTurnMetadata.speakerLabel,
            kindroidParticipantId:
              buffered.kindroidParticipantId ?? assistantTurnMetadata.kindroidParticipantId
          }
        : {
            turnId: event.turnId,
            text: event.text,
            ...assistantTurnMetadata
          };
    return;
  }

  context.setTurns((previous) =>
    appendOrUpdateAssistantTurn(
      previous,
      event.turnId,
      event.text,
      "append",
      assistantTurnMetadata
    )
  );
}

function handleAssistantCompleted(
  event: Extract<CadenceEvent, { type: "assistant.response.completed" }>,
  context: SessionEventContext
): void {
  const baseMetadata = context.getAssistantTurnMetadata();
  const completedAssistantTurnMetadata = {
    ...baseMetadata,
    speakerLabel: event.speakerLabel ?? baseMetadata.speakerLabel,
    kindroidParticipantId: event.kindroidParticipantId ?? baseMetadata.kindroidParticipantId
  };

  if (completedAssistantTurnMetadata.kindroidParticipantId) {
    context.assistantTurnParticipantIdsRef.current.set(
      event.turnId,
      completedAssistantTurnMetadata.kindroidParticipantId
    );
  }

  if (context.stagedTextReplyMode) {
    context.beginVisualReplyDelivery(event.text);
  } else {
    context.updatePerformance(inferPerformanceDirective(event.text), {
      retriggerGesture: true
    });
  }

  context.scheduleHotMicPlaybackRelease(event.text, event.kindroidParticipantId);
  if (context.pendingUserTurnIdRef.current) {
    context.bufferedAssistantTurnRef.current = {
      turnId: event.turnId,
      text: event.text,
      ...completedAssistantTurnMetadata
    };
    context.setStatusCopy("Response complete.");
    return;
  }

  context.setTurns((previous) =>
    appendOrUpdateAssistantTurn(
      previous,
      event.turnId,
      event.text,
      "replace",
      completedAssistantTurnMetadata
    )
  );
  context.setStatusCopy("Response complete.");
}

function handlePendingTurn(
  event: Extract<CadenceEvent, { type: "conversation.turn.pending" }>,
  context: SessionEventContext
): void {
  if (event.turnOwner === "assistant" && event.speakerLabel) {
    const message = event.message ?? `${event.speakerLabel} is thinking...`;
    context.setStatusCopy(message);
    context.setPendingConversationHint({
      kind: "assistant",
      kindroidParticipantId: event.kindroidParticipantId,
      speakerLabel: event.speakerLabel,
      message
    });
    return;
  }

  const message = event.message ?? "Your turn.";
  context.setStatusCopy(message);
  context.setPendingConversationHint({
    kind: "user",
    message
  });
}

function handleAssistantAudioChunk(
  event: Extract<CadenceEvent, { type: "assistant.audio.chunk" }>,
  context: SessionEventContext
): void {
  if (event.captions?.length) {
    context.assistantTurnCaptionCuesRef.current.set(event.turnId, {
      cues: event.captions,
      mode: event.captionsMode ?? "estimated",
      offsetMs: event.captionOffsetMs ?? 0
    });
  }

  if (context.kindroidStageCaptioningEnabled && event.effectCaptionText) {
    context.assistantTurnEffectCaptionsRef.current.set(event.turnId, {
      text: event.effectCaptionText,
      durationMs: Math.max(0, event.effectCaptionDurationMs ?? 0)
    });
  }

  if (!context.responseClock.current.firstAudioAt && context.responseClock.current.startedAt) {
    const now = performance.now();
    context.responseClock.current.firstAudioAt = now;
    context.setMetrics((previous) => ({
      ...previous,
      timeToFirstSpeechMs: Math.round(now - (context.responseClock.current.startedAt ?? now))
    }));
  }
}

function handleAssistantInterrupted(context: SessionEventContext): void {
  context.clearPendingConversationHint();
  context.clearPlaybackSuppressionTimer();
  context.assistantTurnEffectCaptionsRef.current.clear();
  context.releaseHotMicSuppression();
  context.bufferedAssistantTurnRef.current = null;
  context.clearStageTimeline();
  context.setActiveStateId("listening");
  context.updatePerformance(buildListeningDirective("interrupted"));
  context.responseClock.current.interruptionStartedAt = performance.now();
  context.setStatusCopy("Interrupted. Ready for the next utterance.");
}

function handleTransportError(
  event: Extract<CadenceEvent, { type: "transport.error" }>,
  context: SessionEventContext
): void {
  if (isBenignInterruptError(event.message, event.recoverable)) {
    context.setStatusCopy(
      buildListeningStatusCopy(context.voiceInputMode, context.hotMicMutedRef.current)
    );
    return;
  }

  context.clearPendingConversationHint();
  context.clearPlaybackSuppressionTimer();
  context.assistantTurnParticipantIdsRef.current.clear();
  context.assistantTurnCaptionCuesRef.current.clear();
  context.assistantTurnEffectCaptionsRef.current.clear();
  context.releaseHotMicSuppression();
  context.clearPendingUserTurn();
  context.bufferedAssistantTurnRef.current = null;
  context.clearStageTimeline();
  context.setActiveStateId("error");
  context.updatePerformance(buildErrorDirective(), { retriggerGesture: true });
  context.setConnectionReady(false);
  context.setConfigured(!(event.code?.startsWith("config.") && !event.recoverable));
  context.setStatusCopy(event.message);
}
