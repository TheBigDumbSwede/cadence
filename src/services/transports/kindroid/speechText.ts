export function stripKindroidNarrationForSpeech(text: string): string {
  const withoutDelimitedNarration = text.replace(/\*[^*]*\*/g, " ");
  const paragraphs = withoutDelimitedNarration
    .split(/\n\s*\n+/)
    .map((paragraph) =>
      paragraph
        .replace(/[^\S\r\n]+/g, " ")
        .replace(/\s+([,.;!?])/g, "$1")
        .trim()
    )
    .filter(Boolean);

  return paragraphs.join("\n\n");
}
