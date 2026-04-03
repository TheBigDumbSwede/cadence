import type { ElevenLabsBridge } from "../shared/elevenlabs-control";
import type { KindroidBridge } from "../shared/kindroid-control";
import type { OpenAiAudioBridge } from "../shared/openai-audio-control";
import type { OpenAiSpeechBridge } from "../shared/openai-speech-control";
import type { RealtimeBridge } from "../shared/realtime-control";
import type { SettingsBridge } from "../shared/settings-control";
import type { TextBridge } from "../shared/text-control";

type CadenceBridge = {
  elevenlabs: ElevenLabsBridge;
  getRuntimeInfo: typeof window.cadence extends { getRuntimeInfo: infer T } ? T : never;
  kindroid: KindroidBridge;
  openaiAudio: OpenAiAudioBridge;
  openaiSpeech: OpenAiSpeechBridge;
  realtime: RealtimeBridge;
  settings: SettingsBridge;
  text: TextBridge;
};

export function getCadenceBridge(): CadenceBridge {
  if (!window.cadence) {
    throw new Error("Cadence preload bridge is unavailable.");
  }

  return window.cadence as CadenceBridge;
}
