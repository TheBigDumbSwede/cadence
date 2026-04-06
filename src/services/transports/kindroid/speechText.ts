function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripKindroidNarrationForSpeech(
  text: string,
  options?: {
    enabled?: boolean;
    delimiter?: string;
  }
): string {
  const delimiter = options?.delimiter?.trim() || "*";
  const escapedDelimiter = escapeRegExp(delimiter);

  if (!options?.enabled) {
    return text
      .replace(new RegExp(escapedDelimiter, "g"), "")
      .split(/\n\s*\n+/)
      .map((paragraph) =>
        paragraph
          .replace(/[^\S\r\n]+/g, " ")
          .replace(/\s+([,.;!?])/g, "$1")
          .trim()
      )
      .filter(Boolean)
      .join("\n\n");
  }

  const narrationPattern = new RegExp(`${escapedDelimiter}[\\s\\S]*?${escapedDelimiter}`, "g");
  const withoutDelimitedNarration = text.replace(narrationPattern, " ");
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
