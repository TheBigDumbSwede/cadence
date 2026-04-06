import type { TextBackendProvider } from "../../shared/backend-provider";
import type { InteractionMode } from "../../shared/interaction-mode";
import type { TtsProvider } from "../../shared/tts-provider";
import type { VoiceInputMode } from "../../shared/voice-input-mode";
import type { VoiceBackendProvider } from "../../shared/voice-backend";

type StatusContext = {
  mode: InteractionMode;
  voiceBackend: VoiceBackendProvider;
  voiceInputMode: VoiceInputMode;
  hotMicMuted: boolean;
  textBackend: TextBackendProvider;
  ttsProvider: TtsProvider;
};

export function buildReadyStatusCopy({
  mode,
  voiceInputMode,
  hotMicMuted
}: Pick<StatusContext, "mode" | "voiceInputMode" | "hotMicMuted">): string {
  if (mode !== "voice") {
    return "Ready.";
  }

  if (voiceInputMode === "hot_mic") {
    return hotMicMuted ? "Ready. Hot mic is paused." : "Ready. Hot mic is armed.";
  }

  return "Ready. Hold the button or press Space.";
}

export function buildPreparingStatusCopy({
  mode,
  voiceBackend,
  textBackend,
  ttsProvider
}: Pick<StatusContext, "mode" | "voiceBackend" | "textBackend" | "ttsProvider">): string {
  if (mode === "text") {
    return textBackend === "kindroid"
      ? "Preparing Kindroid text mode..."
      : "Preparing text-only mode...";
  }

  if (voiceBackend === "kindroid") {
    return `Preparing Kindroid voice mode with ${
      ttsProvider === "none"
        ? "text replies only"
        : ttsProvider === "openai"
          ? "OpenAI speech"
          : "ElevenLabs"
    }...`;
  }

  if (voiceBackend === "openai-batch") {
    return "Preparing OpenAI Voice mode...";
  }

  return "Preparing voice mode...";
}

export function buildSubmitStatusCopy({
  mode,
  voiceBackend,
  textBackend,
  ttsProvider
}: Pick<StatusContext, "mode" | "voiceBackend" | "textBackend" | "ttsProvider">): string {
  if (mode === "text") {
    return textBackend === "kindroid" ? "Sending text to Kindroid..." : "Sending text...";
  }

  if (voiceBackend === "kindroid") {
    return `Sending text through Kindroid voice session with ${
      ttsProvider === "none"
        ? "text reply only"
        : ttsProvider === "openai"
          ? "OpenAI speech"
          : "ElevenLabs"
    }...`;
  }

  if (voiceBackend === "openai-batch") {
    return `Sending text through OpenAI Voice with ${
      ttsProvider === "none"
        ? "text reply only"
        : ttsProvider === "openai"
          ? "OpenAI speech"
          : "ElevenLabs"
    }...`;
  }

  return "Sending text through OpenAI Realtime...";
}

export function buildListeningStatusCopy(
  voiceInputMode: VoiceInputMode,
  hotMicMuted: boolean
): string {
  return voiceInputMode === "hot_mic"
    ? hotMicMuted
      ? "Hot mic is paused."
      : "Hot mic is armed."
    : "Listening...";
}
