import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetrics, ConversationTurn } from "../../shared/conversation-types";
import { handleCadenceSessionEvent } from "./sessionEvents";

type SessionEventContext = Parameters<typeof handleCadenceSessionEvent>[1];

function createHarness(options?: {
  mode?: "voice" | "text";
  voiceInputMode?: "push_to_talk" | "hot_mic";
  stagedTextReplyMode?: boolean;
  kindroidStageCaptioningEnabled?: boolean;
  turns?: ConversationTurn[];
}) {
  let turns = options?.turns ?? [];
  let metrics: ConversationMetrics = {
    timeToListeningMs: 0,
    timeToFirstSpeechMs: 0,
    interruptRecoveryMs: 0
  };
  let activeStateId = "idle";
  let statusCopy = "";
  let configured = false;
  let connectionReady = false;
  let pendingConversationHint: unknown = null;
  let lastMemoryRecall: { provider: string; contextBlock: string } | null = null;
  let lastMemoryIngest: {
    provider: string;
    written: number;
    updated: number;
    ignored: number;
  } | null = null;

  const setTurns = vi.fn(
    (value: ConversationTurn[] | ((previous: ConversationTurn[]) => ConversationTurn[])) => {
      turns = typeof value === "function" ? value(turns) : value;
    }
  );
  const setMetrics = vi.fn(
    (value: ConversationMetrics | ((previous: ConversationMetrics) => ConversationMetrics)) => {
      metrics = typeof value === "function" ? value(metrics) : value;
    }
  );
  const setActiveStateId = vi.fn((value: string | ((previous: string) => string)) => {
    activeStateId = typeof value === "function" ? value(activeStateId) : value;
  });
  const setStatusCopy = vi.fn((value: string | ((previous: string) => string)) => {
    statusCopy = typeof value === "function" ? value(statusCopy) : value;
  });
  const setConfigured = vi.fn((value: boolean | ((previous: boolean) => boolean)) => {
    configured = typeof value === "function" ? value(configured) : value;
  });
  const setConnectionReady = vi.fn((value: boolean | ((previous: boolean) => boolean)) => {
    connectionReady = typeof value === "function" ? value(connectionReady) : value;
  });
  const setPendingConversationHint = vi.fn((value: unknown) => {
    pendingConversationHint =
      typeof value === "function"
        ? (value as (previous: unknown) => unknown)(pendingConversationHint)
        : value;
  });
  const setLastMemoryRecall = vi.fn(
    (
      value:
        | { provider: string; contextBlock: string }
        | null
        | ((
            previous: { provider: string; contextBlock: string } | null
          ) => { provider: string; contextBlock: string } | null)
    ) => {
      lastMemoryRecall = typeof value === "function" ? value(lastMemoryRecall) : value;
    }
  );
  const setLastMemoryIngest = vi.fn(
    (
      value:
        | {
            provider: string;
            written: number;
            updated: number;
            ignored: number;
          }
        | null
        | ((
            previous: {
              provider: string;
              written: number;
              updated: number;
              ignored: number;
            } | null
          ) => {
            provider: string;
            written: number;
            updated: number;
            ignored: number;
          } | null)
    ) => {
      lastMemoryIngest = typeof value === "function" ? value(lastMemoryIngest) : value;
    }
  );

  const context: SessionEventContext = {
    mode: options?.mode ?? "voice",
    voiceInputMode: options?.voiceInputMode ?? "push_to_talk",
    stagedTextReplyMode: options?.stagedTextReplyMode ?? false,
    kindroidStageCaptioningEnabled: options?.kindroidStageCaptioningEnabled ?? false,
    hotMicMutedRef: { current: false },
    poseHoldTimerRef: { current: null },
    stageTimelineManagedRef: { current: false },
    pendingUserTurnIdRef: { current: null },
    bufferedAssistantTurnRef: { current: null },
    assistantTurnParticipantIdsRef: { current: new Map() },
    assistantTurnCaptionCuesRef: { current: new Map() },
    assistantTurnEffectCaptionsRef: { current: new Map() },
    responseClock: {
      current: {
        startedAt: null,
        firstAudioAt: null,
        interruptionStartedAt: null
      }
    },
    clearPlaybackSuppressionTimer: vi.fn(),
    suppressHotMicPlayback: vi.fn(),
    releaseHotMicSuppression: vi.fn(),
    clearPoseHold: vi.fn(),
    clearPendingConversationHint: vi.fn(),
    clearStageTimeline: vi.fn(),
    clearPendingUserTurn: vi.fn(),
    updatePerformance: vi.fn(),
    beginVisualReplyPrelude: vi.fn(),
    beginVisualReplyDelivery: vi.fn(),
    getAssistantTurnMetadata: () => ({
      speakerLabel: "Cadence",
      kindroidParticipantId: "kin-1"
    }),
    scheduleHotMicPlaybackRelease: vi.fn(),
    setActiveStateId: setActiveStateId as SessionEventContext["setActiveStateId"],
    setStatusCopy: setStatusCopy as SessionEventContext["setStatusCopy"],
    setConnectionReady: setConnectionReady as SessionEventContext["setConnectionReady"],
    setConfigured: setConfigured as SessionEventContext["setConfigured"],
    setPendingConversationHint:
      setPendingConversationHint as SessionEventContext["setPendingConversationHint"],
    setTurns: setTurns as SessionEventContext["setTurns"],
    setMetrics: setMetrics as SessionEventContext["setMetrics"],
    setLastMemoryRecall: setLastMemoryRecall as SessionEventContext["setLastMemoryRecall"],
    setLastMemoryIngest: setLastMemoryIngest as SessionEventContext["setLastMemoryIngest"]
  };

  return {
    context,
    getTurns: () => turns,
    getMetrics: () => metrics,
    getActiveStateId: () => activeStateId,
    getStatusCopy: () => statusCopy,
    getConfigured: () => configured,
    getConnectionReady: () => connectionReady,
    getPendingConversationHint: () => pendingConversationHint,
    getLastMemoryRecall: () => lastMemoryRecall,
    getLastMemoryIngest: () => lastMemoryIngest
  };
}

describe("handleCadenceSessionEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reconciles a final transcript with a pending user turn and buffered assistant turn", () => {
    const harness = createHarness({
      turns: [
        {
          id: "pending-user-1",
          speaker: "user",
          timestamp: "10:00",
          text: "..."
        }
      ]
    });

    harness.context.pendingUserTurnIdRef.current = "pending-user-1";
    harness.context.bufferedAssistantTurnRef.current = {
      turnId: "assistant-1",
      text: "Buffered reply",
      speakerLabel: "Cadence"
    };

    handleCadenceSessionEvent(
      {
        type: "transcript.final",
        turnId: "user-1",
        text: "Actual user text"
      },
      harness.context
    );

    expect(harness.context.pendingUserTurnIdRef.current).toBeNull();
    expect(harness.context.bufferedAssistantTurnRef.current).toBeNull();
    expect(harness.getTurns()).toHaveLength(2);
    expect(harness.getTurns()[0]).toMatchObject({
      id: "user-1",
      speaker: "user",
      text: "Actual user text"
    });
    expect(harness.getTurns()[1]).toMatchObject({
      id: "assistant-1",
      speaker: "assistant",
      speakerLabel: "Cadence",
      text: "Buffered reply"
    });
    expect(harness.context.clearPendingConversationHint).toHaveBeenCalled();
    expect(harness.context.updatePerformance).toHaveBeenCalledTimes(1);
    expect(harness.context.updatePerformance).toHaveBeenCalledWith(
      expect.objectContaining({ cue: "user-turn", gesture: "thinking_touch" })
    );
  });

  it("buffers a completed assistant response while a user turn is still pending", () => {
    const harness = createHarness();
    harness.context.pendingUserTurnIdRef.current = "pending-user-1";

    handleCadenceSessionEvent(
      {
        type: "assistant.response.completed",
        turnId: "assistant-1",
        text: "Done.",
        speakerLabel: "Nora",
        kindroidParticipantId: "kin-42"
      },
      harness.context
    );

    expect(harness.getTurns()).toEqual([]);
    expect(harness.context.bufferedAssistantTurnRef.current).toEqual({
      turnId: "assistant-1",
      text: "Done.",
      speakerLabel: "Nora",
      kindroidParticipantId: "kin-42"
    });
    expect(harness.context.assistantTurnParticipantIdsRef.current.get("assistant-1")).toBe(
      "kin-42"
    );
    expect(harness.context.scheduleHotMicPlaybackRelease).toHaveBeenCalledWith(
      "Done.",
      "kin-42"
    );
    expect(harness.getStatusCopy()).toBe("Response complete.");
    expect(harness.context.updatePerformance).toHaveBeenCalledWith(
      expect.objectContaining({ cue: expect.any(String) }),
      { retriggerGesture: true }
    );
  });

  it("resets state on a non-benign transport error", () => {
    const harness = createHarness();
    harness.context.bufferedAssistantTurnRef.current = {
      turnId: "assistant-1",
      text: "stale"
    };
    harness.context.assistantTurnParticipantIdsRef.current.set("assistant-1", "kin-1");
    harness.context.assistantTurnCaptionCuesRef.current.set("assistant-1", {
      cues: [{ text: "Hello", startMs: 0, endMs: 500 }],
      mode: "estimated",
      offsetMs: 0
    });
    harness.context.assistantTurnEffectCaptionsRef.current.set("assistant-1", {
      text: "thump",
      durationMs: 200
    });

    handleCadenceSessionEvent(
      {
        type: "transport.error",
        provider: "openai",
        code: "config.openai_api_key_missing",
        message: "Missing API key.",
        recoverable: false
      },
      harness.context
    );

    expect(harness.context.clearPendingConversationHint).toHaveBeenCalled();
    expect(harness.context.clearPlaybackSuppressionTimer).toHaveBeenCalled();
    expect(harness.context.releaseHotMicSuppression).toHaveBeenCalled();
    expect(harness.context.clearPendingUserTurn).toHaveBeenCalled();
    expect(harness.context.clearStageTimeline).toHaveBeenCalled();
    expect(harness.context.assistantTurnParticipantIdsRef.current.size).toBe(0);
    expect(harness.context.assistantTurnCaptionCuesRef.current.size).toBe(0);
    expect(harness.context.assistantTurnEffectCaptionsRef.current.size).toBe(0);
    expect(harness.context.bufferedAssistantTurnRef.current).toBeNull();
    expect(harness.getActiveStateId()).toBe("error");
    expect(harness.getConnectionReady()).toBe(false);
    expect(harness.getConfigured()).toBe(false);
    expect(harness.getStatusCopy()).toBe("Missing API key.");
    expect(harness.context.updatePerformance).toHaveBeenCalledWith(
      expect.objectContaining({ cue: "error", gesture: "small_shrug" }),
      { retriggerGesture: true }
    );
  });

  it("marks the session ready and reports the correct hot mic status", () => {
    const harness = createHarness({
      mode: "voice",
      voiceInputMode: "hot_mic"
    });

    handleCadenceSessionEvent(
      {
        type: "session.status",
        provider: "openai",
        status: "ready"
      },
      harness.context
    );

    expect(harness.getConnectionReady()).toBe(true);
    expect(harness.getConfigured()).toBe(true);
    expect(harness.getActiveStateId()).toBe("idle");
    expect(harness.getStatusCopy()).toBe("Ready. Hot mic is armed.");
    expect(harness.context.releaseHotMicSuppression).not.toHaveBeenCalled();
    expect(harness.context.updatePerformance).toHaveBeenCalledWith(
      expect.objectContaining({ cue: "ready", mood: "neutral" })
    );
  });

  it("stores playback metadata, updates time-to-first-speech, and records memory debug events", () => {
    const harness = createHarness({
      kindroidStageCaptioningEnabled: true
    });
    harness.context.responseClock.current.startedAt = 1_000;
    vi.spyOn(performance, "now").mockReturnValue(1_450);

    handleCadenceSessionEvent(
      {
        type: "assistant.audio.chunk",
        turnId: "assistant-1",
        sequence: 0,
        format: "pcm16",
        data: new ArrayBuffer(8),
        captionOffsetMs: 120,
        captionsMode: "estimated",
        captions: [{ text: "Hello", startMs: 0, endMs: 500 }],
        effectCaptionText: "rustle",
        effectCaptionDurationMs: 220
      },
      harness.context
    );

    handleCadenceSessionEvent(
      {
        type: "memory.recall",
        provider: "memory-sidecar",
        contextBlock: "Known preference: concise replies."
      },
      harness.context
    );

    handleCadenceSessionEvent(
      {
        type: "memory.ingest",
        provider: "memory-sidecar",
        written: 1,
        updated: 0,
        ignored: 2
      },
      harness.context
    );

    expect(harness.context.assistantTurnCaptionCuesRef.current.get("assistant-1")).toEqual({
      cues: [{ text: "Hello", startMs: 0, endMs: 500 }],
      mode: "estimated",
      offsetMs: 120
    });
    expect(harness.context.assistantTurnEffectCaptionsRef.current.get("assistant-1")).toEqual({
      text: "rustle",
      durationMs: 220
    });
    expect(harness.getMetrics().timeToFirstSpeechMs).toBe(450);
    expect(harness.getLastMemoryRecall()).toEqual({
      provider: "memory-sidecar",
      contextBlock: "Known preference: concise replies."
    });
    expect(harness.getLastMemoryIngest()).toEqual({
      provider: "memory-sidecar",
      written: 1,
      updated: 0,
      ignored: 2
    });
  });
});
