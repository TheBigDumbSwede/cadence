import type { TextBackendProvider } from "./backend-provider";
import type { InteractionMode } from "./interaction-mode";
import type { TtsProvider } from "./tts-provider";
import type { VoiceBackendProvider } from "./voice-backend";

export type SettingsPreferences = {
  mode: InteractionMode;
  textBackend: TextBackendProvider;
  ttsProvider: TtsProvider;
  voiceBackend: VoiceBackendProvider;
};

export type SettingsSnapshot = {
  preferences: SettingsPreferences;
  openAiTtsVoice: string;
  elevenLabsVoiceId: string;
  kindroidAiId: string;
  kindroidBaseUrl: string;
  hasOpenAiApiKey: boolean;
  hasElevenLabsApiKey: boolean;
  hasKindroidApiKey: boolean;
  secretStorage: "encrypted" | "plain";
};

export type SettingsUpdate = {
  preferences: SettingsPreferences;
  openAiTtsVoice: string;
  elevenLabsVoiceId: string;
  kindroidAiId: string;
  kindroidBaseUrl: string;
  openAiApiKey?: string;
  elevenLabsApiKey?: string;
  kindroidApiKey?: string;
  clearOpenAiApiKey?: boolean;
  clearElevenLabsApiKey?: boolean;
  clearKindroidApiKey?: boolean;
};
