import type { TextBackendProvider } from "./backend-provider";
import type { InteractionMode } from "./interaction-mode";
import type {
  KindroidConversationMode,
  KindroidGroupMirror
} from "./kindroid-group-mirrors";
import type { KindroidParticipant } from "./kindroid-participants";
import type { TtsProvider } from "./tts-provider";
import type { VoiceInputMode } from "./voice-input-mode";
import type { VoiceBackendProvider } from "./voice-backend";

export type SettingsPreferences = {
  mode: InteractionMode;
  textBackend: TextBackendProvider;
  ttsProvider: TtsProvider;
  voiceInputMode: VoiceInputMode;
  voiceBackend: VoiceBackendProvider;
};

export type SettingsSnapshot = {
  preferences: SettingsPreferences;
  openAiTtsVoice: string;
  openAiTtsInstructions: string;
  memoryBaseUrl: string;
  elevenLabsVoiceId: string;
  kindroidAiId: string;
  kindroidBaseUrl: string;
  kindroidGreeting: string;
  kindroidConversationMode: KindroidConversationMode;
  kindroidParticipants: KindroidParticipant[];
  activeKindroidParticipantId: string | null;
  kindroidGroupMirrors: KindroidGroupMirror[];
  activeKindroidGroupMirrorId: string | null;
  activeKindroidGroupSpeakerParticipantId: string | null;
  hasOpenAiApiKey: boolean;
  hasElevenLabsApiKey: boolean;
  hasKindroidApiKey: boolean;
  secretStorage: "encrypted" | "plain";
};

export type SettingsUpdate = {
  preferences: SettingsPreferences;
  openAiTtsVoice: string;
  openAiTtsInstructions: string;
  memoryBaseUrl: string;
  elevenLabsVoiceId: string;
  kindroidAiId: string;
  kindroidBaseUrl: string;
  kindroidGreeting: string;
  kindroidConversationMode: KindroidConversationMode;
  kindroidParticipants: KindroidParticipant[];
  activeKindroidParticipantId: string | null;
  kindroidGroupMirrors: KindroidGroupMirror[];
  activeKindroidGroupMirrorId: string | null;
  activeKindroidGroupSpeakerParticipantId: string | null;
  openAiApiKey?: string;
  elevenLabsApiKey?: string;
  kindroidApiKey?: string;
  clearOpenAiApiKey?: boolean;
  clearElevenLabsApiKey?: boolean;
  clearKindroidApiKey?: boolean;
};
