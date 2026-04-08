export type SpeechCaptionCue = {
  text: string;
  startMs: number;
  endMs: number;
};

export type SpeechCaptionMode = "estimated" | "exact";

type SentenceSpan = {
  text: string;
  start: number;
  end: number;
};

function normalizeSentenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function splitSentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const pattern = /[^.!?\n]+(?:[.!?]+|$)|[^\S\r\n]*\n+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    const normalized = normalizeSentenceText(raw);

    if (!normalized) {
      continue;
    }

    spans.push({
      text: normalized,
      start,
      end
    });
  }

  if (spans.length > 0) {
    return spans;
  }

  const normalized = normalizeSentenceText(text);
  return normalized
    ? [
        {
          text: normalized,
          start: 0,
          end: text.length
        }
      ]
    : [];
}

export function estimateSpeechCaptionCues(text: string): SpeechCaptionCue[] {
  const spans = splitSentenceSpans(text);
  if (spans.length === 0) {
    return [];
  }

  const weights = spans.map((span) => {
    const wordCount = span.text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, wordCount);
  });
  const totalDurationMs = Math.max(
    900,
    Math.round(weights.reduce((sum, weight) => sum + weight * 360, 0) + spans.length * 140)
  );

  let cursorMs = 0;
  return spans.map((span, index) => {
    const remainingDuration = totalDurationMs - cursorMs;
    const remainingWeight = weights.slice(index).reduce((sum, weight) => sum + weight, 0);
    const durationMs =
      index === spans.length - 1
        ? remainingDuration
        : Math.max(550, Math.round((remainingDuration * weights[index]) / remainingWeight));
    const cue = {
      text: span.text,
      startMs: cursorMs,
      endMs: cursorMs + durationMs
    };
    cursorMs += durationMs;
    return cue;
  });
}

export function buildAlignedSpeechCaptionCues(options: {
  text: string;
  characterStartTimesMs: number[];
  characterEndTimesMs: number[];
}): SpeechCaptionCue[] {
  const { text, characterStartTimesMs, characterEndTimesMs } = options;
  const spans = splitSentenceSpans(text);
  if (spans.length === 0) {
    return [];
  }

  const cues = spans.map((span) => {
    let startIndex = span.start;
    let endIndex = Math.max(span.start, span.end - 1);

    while (startIndex < span.end && /\s/.test(text[startIndex] ?? "")) {
      startIndex += 1;
    }

    while (endIndex > startIndex && /\s/.test(text[endIndex] ?? "")) {
      endIndex -= 1;
    }

    const startMs = characterStartTimesMs[startIndex];
    const endMs = characterEndTimesMs[endIndex];

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return null;
    }

    return {
      text: span.text,
      startMs,
      endMs
    };
  });

  const validCues = cues.filter((cue): cue is SpeechCaptionCue => Boolean(cue));
  return validCues.length > 0 ? validCues : estimateSpeechCaptionCues(text);
}

export function scaleSpeechCaptionCues(
  cues: SpeechCaptionCue[],
  actualDurationMs: number | null
): SpeechCaptionCue[] {
  if (cues.length === 0 || !actualDurationMs || actualDurationMs <= 0) {
    return cues;
  }

  const estimatedDurationMs = cues[cues.length - 1]?.endMs ?? 0;
  if (estimatedDurationMs <= 0) {
    return cues;
  }

  const scale = actualDurationMs / estimatedDurationMs;
  if (!Number.isFinite(scale) || scale <= 0) {
    return cues;
  }

  return cues.map((cue, index) => ({
    text: cue.text,
    startMs: Math.round(cue.startMs * scale),
    endMs: index === cues.length - 1 ? actualDurationMs : Math.round(cue.endMs * scale)
  }));
}

export function offsetSpeechCaptionCues(
  cues: SpeechCaptionCue[],
  offsetMs: number
): SpeechCaptionCue[] {
  if (cues.length === 0 || offsetMs <= 0) {
    return cues;
  }

  return cues.map((cue) => ({
    text: cue.text,
    startMs: cue.startMs + offsetMs,
    endMs: cue.endMs + offsetMs
  }));
}

export function findActiveSpeechCaptionCue(
  cues: SpeechCaptionCue[],
  elapsedMs: number
): SpeechCaptionCue | null {
  if (cues.length === 0 || elapsedMs < 0) {
    return null;
  }

  return cues.find((cue) => elapsedMs >= cue.startMs && elapsedMs < cue.endMs) ?? null;
}
