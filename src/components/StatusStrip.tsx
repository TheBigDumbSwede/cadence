import type { CadenceSession } from "../services/CadenceSession";
import type { TextBackendProvider } from "../shared/backend-provider";
import type { InteractionMode } from "../shared/interaction-mode";
import type { RuntimeInfo } from "../shared/runtime-info";
import type { TtsProvider } from "../shared/tts-provider";
import type { VoiceBackendProvider } from "../shared/voice-backend";

type StatusStripProps = {
  configured: boolean;
  connectionReady: boolean;
  mode: InteractionMode;
  textBackend: TextBackendProvider;
  ttsProvider: TtsProvider;
  voiceBackend: VoiceBackendProvider;
  runtimeInfo: RuntimeInfo | null;
  topology: ReturnType<CadenceSession["describeTopology"]>;
};

export function StatusStrip({
  configured,
  connectionReady,
  mode,
  textBackend,
  ttsProvider,
  voiceBackend,
  runtimeInfo,
  topology
}: StatusStripProps) {
  return (
    <footer className="status-strip">
      <div>
        <p className="eyebrow">System Posture</p>
        <p className="status-copy">
          {mode === "voice"
            ? voiceBackend === "kindroid"
              ? `Kindroid Voice composes OpenAI transcription, Kindroid text replies, and ${
                  ttsProvider === "none"
                    ? "optional speech output"
                    : ttsProvider === "openai"
                      ? "OpenAI"
                      : "ElevenLabs"
                } while leaving OpenAI Realtime untouched.`
              : "Voice mode uses a live OpenAI Realtime transport in the main process, with capture and playback in the renderer."
            : textBackend === "kindroid"
              ? "Text-only Kindroid mode treats Kindroid as a character backend. It stays text-first now, but the transport boundary still leaves room for later STT-in and TTS-out around it."
              : "Text-only mode routes through the Responses API so ordinary development work can stay off the audio-priced path."}
        </p>
      </div>
      <div className="status-grid">
        <span className="status-chip healthy">State model in place</span>
        <span className="status-chip healthy">
          {mode === "voice"
            ? voiceBackend === "kindroid"
              ? `Kindroid voice + ${
                  ttsProvider === "none"
                    ? "text reply"
                    : ttsProvider === "openai"
                      ? "OpenAI TTS"
                      : "ElevenLabs"
                }`
              : "Voice mode"
            : textBackend === "kindroid"
              ? "Kindroid text mode"
              : "Text-only mode"}
        </span>
        <span className={`status-chip ${connectionReady ? "healthy" : "attention"}`}>
          {topology.transport}
        </span>
        <span className={`status-chip ${configured ? "healthy" : "offline"}`}>
          {configured ? "Backend configured" : "Backend incomplete"}
        </span>
        <span className="status-chip attention">Speech adapter swappable</span>
        <span className="status-chip offline">
          {runtimeInfo ? `Node ${runtimeInfo.nodeVersion}` : "Runtime info pending"}
        </span>
      </div>
    </footer>
  );
}
