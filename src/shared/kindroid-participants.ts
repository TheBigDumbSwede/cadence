import type { TtsProvider } from "./tts-provider";

export const KINDROID_WAVEFORM_ACCENT_OPTIONS = [
  "halo",
  "spark",
  "brackets",
  "chevrons",
  "none"
] as const;

export type KindroidWaveformAccent =
  (typeof KINDROID_WAVEFORM_ACCENT_OPTIONS)[number];

export const KINDROID_WAVEFORM_COLOR_PALETTE = [
  "#d7955b",
  "#7bb9df",
  "#d67272",
  "#8fcf9b",
  "#c998e8",
  "#f0be6a"
] as const;

const DEFAULT_KINDROID_WAVEFORM_ACCENTS = KINDROID_WAVEFORM_ACCENT_OPTIONS.filter(
  (accent) => accent !== "none"
);

export function getDefaultKindroidWaveformColor(index = 0): string {
  return KINDROID_WAVEFORM_COLOR_PALETTE[index % KINDROID_WAVEFORM_COLOR_PALETTE.length];
}

export function getDefaultKindroidWaveformAccent(index = 0): KindroidWaveformAccent {
  return DEFAULT_KINDROID_WAVEFORM_ACCENTS[index % DEFAULT_KINDROID_WAVEFORM_ACCENTS.length];
}

export type KindroidParticipant = {
  id: string;
  aiId: string;
  displayName: string;
  bubbleName: string;
  waveformColor: string;
  waveformAccent: KindroidWaveformAccent;
  ttsProvider: TtsProvider;
  filterNarrationForTts: boolean;
  narrationDelimiter: string;
  narrationFxEnabled: boolean;
  openAiVoice: string;
  openAiInstructions: string;
  elevenLabsVoiceId: string;
};
