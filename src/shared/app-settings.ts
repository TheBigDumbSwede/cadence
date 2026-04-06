import type { TextBackendProvider } from "./backend-provider";
import type { InteractionMode } from "./interaction-mode";
import type { KindroidParticipant } from "./kindroid-participants";
import type { StageMode } from "./stage-mode";
import type { TtsProvider } from "./tts-provider";
import type { VoiceInputMode } from "./voice-input-mode";
import type { VoiceBackendProvider } from "./voice-backend";

export type SettingsPreferences = {
  mode: InteractionMode;
  stageMode: StageMode;
  textBackend: TextBackendProvider;
  ttsProvider: TtsProvider;
  voiceInputMode: VoiceInputMode;
  voiceBackend: VoiceBackendProvider;
};

export type AvatarSelection = {
  path: string;
  label: string;
  fileUrl: string;
};

export type SettingsSnapshot = {
  preferences: SettingsPreferences;
  openAiTtsVoice: string;
  openAiTtsInstructions: string;
  elevenLabsVoiceId: string;
  kindroidAiId: string;
  kindroidBaseUrl: string;
  kindroidExperimentalEnabled: boolean;
  kindroidGreeting: string;
  kindroidParticipants: KindroidParticipant[];
  activeKindroidParticipantId: string | null;
  avatar: AvatarSelection | null;
  recentAvatars: AvatarSelection[];
  hasOpenAiApiKey: boolean;
  hasElevenLabsApiKey: boolean;
  hasKindroidApiKey: boolean;
  secretStorage: "encrypted" | "plain";
};

export type SettingsUpdate = {
  preferences: SettingsPreferences;
  openAiTtsVoice: string;
  openAiTtsInstructions: string;
  elevenLabsVoiceId: string;
  kindroidAiId: string;
  kindroidBaseUrl: string;
  kindroidExperimentalEnabled: boolean;
  kindroidGreeting: string;
  kindroidParticipants: KindroidParticipant[];
  activeKindroidParticipantId: string | null;
  openAiApiKey?: string;
  elevenLabsApiKey?: string;
  kindroidApiKey?: string;
  avatarPath?: string;
  clearOpenAiApiKey?: boolean;
  clearElevenLabsApiKey?: boolean;
  clearKindroidApiKey?: boolean;
  clearAvatar?: boolean;
};
