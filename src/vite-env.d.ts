/// <reference types="vite/client" />

import type { ElevenLabsBridge } from "./shared/elevenlabs-control";
import type { KindroidBridge } from "./shared/kindroid-control";
import type { OpenAiAudioBridge } from "./shared/openai-audio-control";
import type { OpenAiSpeechBridge } from "./shared/openai-speech-control";
import type { RealtimeBridge } from "./shared/realtime-control";
import type { SettingsBridge } from "./shared/settings-control";
import type { TextBridge } from "./shared/text-control";
import type { RuntimeInfo } from "./shared/runtime-info";

declare global {
  interface Window {
    cadence?: {
      elevenlabs: ElevenLabsBridge;
      getRuntimeInfo: () => Promise<RuntimeInfo>;
      kindroid: KindroidBridge;
      openaiAudio: OpenAiAudioBridge;
      openaiSpeech: OpenAiSpeechBridge;
      realtime: RealtimeBridge;
      settings: SettingsBridge;
      text: TextBridge;
    };
  }
}

declare module "*.vrma" {
  const src: string;
  export default src;
}

export {};
