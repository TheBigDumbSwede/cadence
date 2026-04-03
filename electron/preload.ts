import { contextBridge, ipcRenderer } from "electron";
import type { ElevenLabsBridge, ElevenLabsControlState } from "../src/shared/elevenlabs-control";
import type { KindroidBridge, KindroidControlState } from "../src/shared/kindroid-control";
import type { OpenAiAudioBridge, OpenAiAudioControlState } from "../src/shared/openai-audio-control";
import type { OpenAiSpeechBridge, OpenAiSpeechControlState } from "../src/shared/openai-speech-control";
import type { RealtimeBridge, RealtimeControlState } from "../src/shared/realtime-control";
import type { TextBridge, TextControlState } from "../src/shared/text-control";
import type { RuntimeInfo } from "../src/shared/runtime-info";
import type { CadenceEvent } from "../src/shared/voice-events";

const cadenceBridge = {
  elevenlabs: {
    getState: () =>
      ipcRenderer.invoke("elevenlabs:get-state") as Promise<ElevenLabsControlState>,
    synthesize: (text: string, options?: { voiceId?: string }) =>
      ipcRenderer.invoke("elevenlabs:synthesize", text, options) as Promise<{
        audio: ArrayBuffer;
        format: "mp3";
        model: string;
        voiceId: string;
      }>
  } satisfies ElevenLabsBridge,
  getRuntimeInfo: () => ipcRenderer.invoke("app:get-runtime-info") as Promise<RuntimeInfo>,
  kindroid: {
    getState: () =>
      ipcRenderer.invoke("kindroid:get-state") as Promise<KindroidControlState>,
    createResponse: (input: string) =>
      ipcRenderer.invoke("kindroid:create-response", input) as Promise<{
        text: string;
        provider: "kindroid";
      }>,
    chatBreak: (greeting: string) =>
      ipcRenderer.invoke("kindroid:chat-break", greeting) as Promise<void>
  } satisfies KindroidBridge,
  openaiAudio: {
    getState: () =>
      ipcRenderer.invoke("openai-audio:get-state") as Promise<OpenAiAudioControlState>,
    transcribe: (audio: ArrayBuffer) =>
      ipcRenderer.invoke("openai-audio:transcribe", audio) as Promise<{
        text: string;
        model: string;
      }>
  } satisfies OpenAiAudioBridge,
  openaiSpeech: {
    getState: () =>
      ipcRenderer.invoke("openai-speech:get-state") as Promise<OpenAiSpeechControlState>,
    synthesize: (text: string, options?: { voice?: string }) =>
      ipcRenderer.invoke("openai-speech:synthesize", text, options) as Promise<{
        audio: ArrayBuffer;
        format: "mp3";
        model: string;
        voice: string;
      }>
  } satisfies OpenAiSpeechBridge,
  realtime: {
    connect: () => ipcRenderer.invoke("realtime:connect") as Promise<void>,
    disconnect: () => ipcRenderer.invoke("realtime:disconnect") as Promise<void>,
    sendUserText: (text: string) =>
      ipcRenderer.invoke("realtime:send-user-text", text) as Promise<void>,
    sendUserAudio: (audio: ArrayBuffer) =>
      ipcRenderer.invoke("realtime:send-user-audio", audio) as Promise<void>,
    interruptAssistant: (reason?: "user_barge_in" | "operator_stop") =>
      ipcRenderer.invoke("realtime:interrupt-assistant", reason) as Promise<void>,
    getState: () =>
      ipcRenderer.invoke("realtime:get-state") as Promise<RealtimeControlState>,
    onEvent: (listener: (event: CadenceEvent) => void) => {
      const handler = (_event: unknown, payload: CadenceEvent) => {
        listener(payload);
      };

      ipcRenderer.on("realtime:event", handler);
      return () => {
        ipcRenderer.removeListener("realtime:event", handler);
      };
    }
  } satisfies RealtimeBridge,
  text: {
    getState: () =>
      ipcRenderer.invoke("text:get-state") as Promise<TextControlState>,
    createResponse: (
      input: string,
      options?: { instructions?: string; model?: string }
    ) =>
      ipcRenderer.invoke("text:create-response", input, options) as Promise<{
        text: string;
        model: string;
      }>
  } satisfies TextBridge
};

contextBridge.exposeInMainWorld("cadence", cadenceBridge);
