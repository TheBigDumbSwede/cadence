import type { TtsProvider } from "./tts-provider";

export type KindroidParticipant = {
  id: string;
  aiId: string;
  displayName: string;
  bubbleName: string;
  ttsProvider: TtsProvider;
  openAiVoice: string;
  openAiInstructions: string;
  elevenLabsVoiceId: string;
};
