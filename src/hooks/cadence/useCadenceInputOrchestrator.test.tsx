// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, type AppErrorLike } from "../../shared/app-error";
import type { PreviewAssistantStateId } from "../../shared/assistant-state";
import type { ConversationMetrics, ConversationTurn } from "../../shared/conversation-types";
import type { PresenceSnapshot } from "../../shared/performance-directive";
import { createPerformanceDirective } from "../../services/stage/performanceHeuristics";
import { snapshotFromDirective } from "./performance";
import { useCadenceInputOrchestrator } from "./useCadenceInputOrchestrator";

type InputHookResult = ReturnType<typeof useCadenceInputOrchestrator>;
type ActEnvironmentGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function createSetStateHarness<T>(initialValue: T) {
  let current = initialValue;
  const setter = vi.fn((value: T | ((previous: T) => T)) => {
    current = typeof value === "function" ? (value as (previous: T) => T)(current) : value;
  });

  return {
    setter,
    getCurrent: () => current
  };
}

function createAppError(overrides: Partial<AppErrorLike> & Pick<AppErrorLike, "message">) {
  return new AppError({
    code: "unknown",
    retryable: true,
    ...overrides
  });
}

const recorderMocks = vi.hoisted(() => ({
  pushToTalkStart: vi.fn(async () => undefined),
  pushToTalkStop: vi.fn(async () => new ArrayBuffer(4)),
  hotMicStart: vi.fn(async () => undefined),
  hotMicStop: vi.fn(async () => undefined),
  hotMicSetSuppressed: vi.fn()
}));

vi.mock("../../services/audio/audioCapture", () => ({
  PushToTalkRecorder: vi.fn(function PushToTalkRecorder() {
    return {
      start: recorderMocks.pushToTalkStart,
      stop: recorderMocks.pushToTalkStop
    };
  }),
  HotMicRecorder: vi.fn(function HotMicRecorder() {
    return {
      start: recorderMocks.hotMicStart,
      stop: recorderMocks.hotMicStop,
      setSuppressed: recorderMocks.hotMicSetSuppressed
    };
  })
}));

function renderInputHook(options?: {
  mode?: "voice" | "text";
  voiceBackend?: "openai" | "openai-batch" | "kindroid";
  voiceInputMode?: "push_to_talk" | "hot_mic";
  textBackend?: "openai" | "kindroid";
  effectiveTtsProvider?: "none" | "openai" | "elevenlabs";
  interactionReady?: boolean;
  isRecording?: boolean;
  inputText?: string;
  turns?: ConversationTurn[];
  stagedTextReplyMode?: boolean;
  assistantSpeaking?: boolean;
  recorderStopResult?: ArrayBuffer;
  interruptError?: Error | null;
  sendTextError?: Error | null;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let hookResult: InputHookResult | null = null;

  const activeStateId = createSetStateHarness<PreviewAssistantStateId>("idle");
  const inputText = createSetStateHarness(options?.inputText ?? "");
  const isRecording = createSetStateHarness(options?.isRecording ?? false);
  const statusCopy = createSetStateHarness("");
  const configured = createSetStateHarness(true);
  const metrics = createSetStateHarness<ConversationMetrics>({
    timeToListeningMs: 0,
    timeToFirstSpeechMs: 0,
    interruptRecoveryMs: 0
  });
  const presenceSnapshot = createSetStateHarness<PresenceSnapshot>(
    snapshotFromDirective(createPerformanceDirective())
  );

  const interruptMock = vi.fn(async () => {
    if (options?.interruptError) {
      throw options.interruptError;
    }
  });
  const sendUserAudioMock = vi.fn(async () => undefined);
  const sendUserTextMock = vi.fn(async () => {
    if (options?.sendTextError) {
      throw options.sendTextError;
    }
  });

  recorderMocks.pushToTalkStart.mockReset();
  recorderMocks.pushToTalkStop.mockReset();
  recorderMocks.hotMicStart.mockReset();
  recorderMocks.hotMicStop.mockReset();
  recorderMocks.hotMicSetSuppressed.mockReset();
  recorderMocks.pushToTalkStart.mockResolvedValue(undefined);
  recorderMocks.pushToTalkStop.mockResolvedValue(
    options?.recorderStopResult ?? new ArrayBuffer(4)
  );
  recorderMocks.hotMicStart.mockResolvedValue(undefined);
  recorderMocks.hotMicStop.mockResolvedValue(undefined);

  const recorderRef = { current: null };
  const hotMicRecorderRef = { current: null };
  const assistantSpeakingRef = { current: options?.assistantSpeaking ?? false };
  const hotMicMutedRef = { current: false };
  const responseClock = {
    current: {
      startedAt: null,
      firstAudioAt: null,
      interruptionStartedAt: null
    }
  };

  const clearPendingConversationHint = vi.fn();
  const insertPendingUserTurn = vi.fn();
  const clearPendingUserTurn = vi.fn();
  const clearStageTimeline = vi.fn();
  const beginVisualReplyPrelude = vi.fn();
  const updatePerformance = vi.fn(
    (
      directive: Parameters<typeof snapshotFromDirective>[0],
      options?: { retriggerGesture?: boolean }
    ) => {
      presenceSnapshot.setter((previous) =>
        snapshotFromDirective(directive, previous, options)
      );
    }
  );

  function TestHarness() {
    hookResult = useCadenceInputOrchestrator({
      activeSession: {
        interrupt: interruptMock,
        sendUserAudio: sendUserAudioMock,
        sendUserText: sendUserTextMock
      } as never,
      mode: options?.mode ?? "voice",
      voiceBackend: options?.voiceBackend ?? "openai",
      voiceInputMode: options?.voiceInputMode ?? "push_to_talk",
      textBackend: options?.textBackend ?? "openai",
      effectiveTtsProvider: options?.effectiveTtsProvider ?? "openai",
      hotMicMuted: false,
      interactionReady: options?.interactionReady ?? true,
      isRecording: isRecording.getCurrent(),
      inputText: inputText.getCurrent(),
      turns: options?.turns ?? [],
      stagedTextReplyMode: options?.stagedTextReplyMode ?? false,
      recorderRef: recorderRef as never,
      hotMicRecorderRef: hotMicRecorderRef as never,
      assistantSpeakingRef,
      hotMicMutedRef,
      responseClock,
      clearPendingConversationHint,
      insertPendingUserTurn,
      clearPendingUserTurn,
      clearStageTimeline,
      updatePerformance,
      beginVisualReplyPrelude,
      setConfigured: configured.setter,
      setIsRecording: isRecording.setter,
      setInputText: inputText.setter,
      setStatusCopy: statusCopy.setter,
      setActiveStateId: activeStateId.setter,
      setMetrics: metrics.setter
    });

    return null;
  }

  act(() => {
    root.render(<TestHarness />);
  });

  return {
    getResult: () => {
      if (!hookResult) {
        throw new Error("Input hook did not render.");
      }

      return hookResult;
    },
    getActiveStateId: activeStateId.getCurrent,
    getInputText: inputText.getCurrent,
    getIsRecording: isRecording.getCurrent,
    getStatusCopy: statusCopy.getCurrent,
    getConfigured: configured.getCurrent,
    getMetrics: metrics.getCurrent,
    startMock: recorderMocks.pushToTalkStart,
    stopMock: recorderMocks.pushToTalkStop,
    setSuppressedMock: recorderMocks.hotMicSetSuppressed,
    interruptMock,
    sendUserAudioMock,
    sendUserTextMock,
    clearPendingConversationHint,
    insertPendingUserTurn,
    clearPendingUserTurn,
    clearStageTimeline,
    beginVisualReplyPrelude,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

describe("useCadenceInputOrchestrator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as ActEnvironmentGlobal).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    (globalThis as ActEnvironmentGlobal).IS_REACT_ACT_ENVIRONMENT = false;
    vi.clearAllMocks();
  });

  it("starts push-to-talk recording and interrupts playback first when needed", async () => {
    const harness = renderInputHook({
      assistantSpeaking: true
    });

    await act(async () => {
      await harness.getResult().startRecording();
    });

    expect(harness.clearPendingConversationHint).toHaveBeenCalled();
    expect(harness.interruptMock).toHaveBeenCalled();
    expect(harness.startMock).toHaveBeenCalled();
    expect(harness.clearStageTimeline).toHaveBeenCalled();
    expect(harness.getIsRecording()).toBe(true);
    expect(harness.getActiveStateId()).toBe("listening");
    expect(harness.getStatusCopy()).toBe("Listening...");

    harness.unmount();
  });

  it("stops push-to-talk recording, uploads audio, and updates metrics", async () => {
    const harness = renderInputHook({
      isRecording: true,
      recorderStopResult: new ArrayBuffer(8)
    });

    await act(async () => {
      await harness.getResult().stopRecording();
    });

    expect(harness.stopMock).toHaveBeenCalled();
    expect(harness.insertPendingUserTurn).toHaveBeenCalled();
    expect(harness.getIsRecording()).toBe(false);
    expect(harness.getActiveStateId()).toBe("transcribing");
    expect(harness.getStatusCopy()).toBe("Uploading captured audio...");
    expect(harness.sendUserAudioMock).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(harness.getMetrics().timeToListeningMs).toBe(180);

    harness.unmount();
  });

  it("handles empty recorded audio without uploading", async () => {
    const harness = renderInputHook({
      isRecording: true,
      recorderStopResult: new ArrayBuffer(0)
    });

    await act(async () => {
      await harness.getResult().stopRecording();
    });

    expect(harness.clearPendingUserTurn).toHaveBeenCalled();
    expect(harness.sendUserAudioMock).not.toHaveBeenCalled();
    expect(harness.getStatusCopy()).toBe("No audio captured.");
    expect(harness.getIsRecording()).toBe(false);

    harness.unmount();
  });

  it("clears configuration when submit text fails with a config error", async () => {
    const harness = renderInputHook({
      mode: "text",
      inputText: "Please keep replies concise.",
      stagedTextReplyMode: true,
      sendTextError: createAppError({
        code: "config.openai_responses_missing",
        message: "OpenAI Responses is not configured."
      })
    });

    await act(async () => {
      await harness.getResult().submitText();
    });

    expect(harness.clearPendingConversationHint).toHaveBeenCalled();
    expect(harness.getInputText()).toBe("");
    expect(harness.beginVisualReplyPrelude).toHaveBeenCalledWith(
      "Please keep replies concise."
    );
    expect(harness.sendUserTextMock).toHaveBeenCalledWith("Please keep replies concise.", []);
    expect(harness.getConfigured()).toBe(false);
    expect(harness.getStatusCopy()).toBe("OpenAI Responses is not configured.");

    harness.unmount();
  });
});
