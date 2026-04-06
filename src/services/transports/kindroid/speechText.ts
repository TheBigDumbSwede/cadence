export function stripKindroidNarrationForSpeech(text: string): string {
  const withoutDelimitedNarration = text.replace(/\*[^*]*\*/g, " ");
  const normalized = withoutDelimitedNarration
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();

  return normalized;
}
