// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewAssistantStateId } from "../../shared/assistant-state";
import type { PresenceSnapshot } from "../../shared/performance-directive";
import { createPerformanceDirective } from "../../services/stage/performanceHeuristics";
import { snapshotFromDirective } from "./performance";
import { estimateAssistantReadMs, estimateUserReadMs } from "./timing";
import { useCadenceStageOrchestrator } from "./useCadenceStageOrchestrator";

type StageHookResult = ReturnType<typeof useCadenceStageOrchestrator>;
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

function renderStageHook(options?: {
  mode?: "voice" | "text";
  voiceBackend?: "openai" | "openai-batch" | "kindroid";
  voiceInputMode?: "push_to_talk" | "hot_mic";
  ttsProvider?: "none" | "openai" | "elevenlabs";
  effectiveKindroidTtsProvider?: "none" | "openai" | "elevenlabs";
  connectionReady?: boolean;
  stagedTextReplyMode?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let hookResult: StageHookResult | null = null;

  const statusCopy = createSetStateHarness("");
  const activeStateId = createSetStateHarness<PreviewAssistantStateId>("idle");
  const presenceSnapshot = createSetStateHarness<PresenceSnapshot>(
    snapshotFromDirective(createPerformanceDirective())
  );
  const setSuppressed = vi.fn();
  const hotMicRecorderRef = {
    current: {
      setSuppressed
    }
  };
  const hotMicMutedRef = { current: false };

  function TestHarness() {
    hookResult = useCadenceStageOrchestrator({
      mode: options?.mode ?? "voice",
      voiceBackend: options?.voiceBackend ?? "openai",
      voiceInputMode: options?.voiceInputMode ?? "hot_mic",
      ttsProvider: options?.ttsProvider ?? "openai",
      effectiveKindroidTtsProvider: options?.effectiveKindroidTtsProvider ?? "openai",
      connectionReady: options?.connectionReady ?? true,
      stagedTextReplyMode: options?.stagedTextReplyMode ?? false,
      activeKindroidParticipant: null,
      usesKindroidGroupConversation: false,
      kindroidParticipants: [],
      hotMicRecorderRef: hotMicRecorderRef as unknown as Parameters<
        typeof useCadenceStageOrchestrator
      >[0]["hotMicRecorderRef"],
      hotMicMutedRef,
      setStatusCopy: statusCopy.setter,
      setActiveStateId: activeStateId.setter,
      setPresenceSnapshot: presenceSnapshot.setter
    });

    return null;
  }

  act(() => {
    root.render(<TestHarness />);
  });

  return {
    getResult: () => {
      if (!hookResult) {
        throw new Error("Stage hook did not render.");
      }

      return hookResult;
    },
    getStatusCopy: statusCopy.getCurrent,
    getActiveStateId: activeStateId.getCurrent,
    getPresenceSnapshot: presenceSnapshot.getCurrent,
    setSuppressed,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

describe("useCadenceStageOrchestrator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as ActEnvironmentGlobal).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    (globalThis as ActEnvironmentGlobal).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("runs the staged text prelude from listening into thinking", () => {
    const harness = renderStageHook({
      stagedTextReplyMode: true
    });

    act(() => {
      harness.getResult().beginVisualReplyPrelude("A short user turn.");
    });

    expect(harness.getResult().stageTimelineManagedRef.current).toBe(true);
    expect(harness.getActiveStateId()).toBe("listening");
    expect(harness.getPresenceSnapshot()).toEqual(
      expect.objectContaining({
        cue: "user-turn",
        mood: "focused"
      })
    );

    act(() => {
      vi.advanceTimersByTime(estimateUserReadMs("A short user turn."));
    });

    expect(harness.getActiveStateId()).toBe("thinking");
    expect(harness.getPresenceSnapshot()).toEqual(
      expect.objectContaining({
        cue: "thinking",
        gesture: "thinking_touch"
      })
    );

    harness.unmount();
  });

  it("releases hot mic after estimated spoken playback", () => {
    const harness = renderStageHook({
      mode: "voice",
      voiceBackend: "openai",
      voiceInputMode: "hot_mic",
      ttsProvider: "openai",
      connectionReady: true,
      stagedTextReplyMode: false
    });

    act(() => {
      harness.getResult().scheduleHotMicPlaybackRelease("This should be spoken.");
    });

    expect(harness.getResult().assistantSpeakingRef.current).toBe(true);
    expect(harness.setSuppressed).toHaveBeenCalledWith(true);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(harness.getResult().assistantSpeakingRef.current).toBe(false);
    expect(harness.setSuppressed).toHaveBeenLastCalledWith(false);
    expect(harness.getStatusCopy()).toBe("Hot mic is armed.");

    harness.unmount();
  });

  it("does not suppress hot mic when speech output is disabled", () => {
    const harness = renderStageHook({
      mode: "voice",
      voiceBackend: "openai-batch",
      voiceInputMode: "hot_mic",
      ttsProvider: "none"
    });

    act(() => {
      harness.getResult().scheduleHotMicPlaybackRelease("This should stay text only.");
    });

    expect(harness.getResult().assistantSpeakingRef.current).toBe(false);
    expect(harness.setSuppressed).not.toHaveBeenCalled();
    expect(harness.getStatusCopy()).toBe("");

    harness.unmount();
  });

  it("holds the speaking pose and returns to idle after staged text delivery", () => {
    const harness = renderStageHook({
      stagedTextReplyMode: true
    });

    act(() => {
      harness.getResult().beginVisualReplyDelivery("A delivered reply.");
    });

    expect(harness.getActiveStateId()).toBe("speaking");
    expect(harness.getResult().stageTimelineManagedRef.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(estimateAssistantReadMs("A delivered reply."));
    });

    expect(harness.getActiveStateId()).toBe("idle");
    expect(harness.getResult().stageTimelineManagedRef.current).toBe(false);
    expect(harness.getPresenceSnapshot()).toEqual(
      expect.objectContaining({
        cue: "ready",
        mood: "neutral"
      })
    );

    harness.unmount();
  });
});
