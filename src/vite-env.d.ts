/// <reference types="vite/client" />

import type { ElevenLabsBridge } from "./shared/elevenlabs-control";
import type { KindroidExperimentalBridge } from "./shared/kindroid-experimental-control";
import type { KindroidBridge } from "./shared/kindroid-control";
import type { MemoryBridge } from "./shared/memory-control";
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
      kindroidExperimental: KindroidExperimentalBridge;
      memory: MemoryBridge;
      openaiAudio: OpenAiAudioBridge;
      openaiSpeech: OpenAiSpeechBridge;
      realtime: RealtimeBridge;
      settings: SettingsBridge;
      text: TextBridge;
    };
  }
}

export {};
