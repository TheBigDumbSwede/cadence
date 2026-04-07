import type { SpeechCaptionCue } from "../../../shared/speech-captions";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type SelectedNarrationEffect = {
  sourceText: string;
  prompt: string;
  durationSeconds: number;
  promptInfluence: number;
  gain: number;
  rawSpanStart: number;
  rawSpanEnd: number;
};

export type NarrationEffectDiagnostic = {
  text: string;
  matchedPatterns: string[];
};

type NarrationSegment = {
  text: string;
  rawSpanStart: number;
  rawSpanEnd: number;
};

const AUDIBLE_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  prompt: string;
  durationSeconds: number;
  gain: number;
  score: number;
}> = [
  {
    name: "storm",
    pattern: /\b(thunder|lightning|storm|rain|downpour|wind howls?)\b/i,
    prompt: "distant thunder and storm ambience, no voices, no music",
    durationSeconds: 3.2,
    gain: 0.42,
    score: 5
  },
  {
    name: "footsteps",
    pattern: /\b(footsteps?|boots?|stomps?|paces?|walks? closer|approaches?)\b/i,
    prompt: "approaching footsteps on a hard floor, subtle room ambience, no voices, no music",
    durationSeconds: 1.8,
    gain: 0.4,
    score: 4
  },
  {
    name: "scurry",
    pattern: /\b(scrambles?|scurries?|dashes?|rushes?|bounds?|bounces? over)\b/i,
    prompt: "quick light footsteps scurrying across a floor, no voices, no music",
    durationSeconds: 1.4,
    gain: 0.4,
    score: 3
  },
  {
    name: "clink",
    pattern: /\b(clink|clang|rattle|jingles?|chimes?)\b/i,
    prompt: "small metallic clink, close foley, no voices, no music",
    durationSeconds: 1.1,
    gain: 0.46,
    score: 4
  },
  {
    name: "impact",
    pattern: /\b(drop|drops|dropped|thud|slam|slams|bang|crash|smash)\b/i,
    prompt: "short impact sound, close foley, no voices, no music",
    durationSeconds: 1.2,
    gain: 0.48,
    score: 4
  },
  {
    name: "paper",
    pattern: /\b(rustles?|crinkles?|unfolds?|paper|parchment|pages? flip)\b/i,
    prompt: "paper rustling close to the listener, no voices, no music",
    durationSeconds: 1.2,
    gain: 0.4,
    score: 3
  },
  {
    name: "zipper",
    pattern: /\b(zipper|zips?|unzips?|jacket rustles?|fabric swishes?|cloth swishes?)\b/i,
    prompt: "zipper pull and jacket fabric rustle, close foley, no voices, no music",
    durationSeconds: 1.0,
    gain: 0.44,
    score: 4
  },
  {
    name: "door",
    pattern: /\b(creaks?|door opens?|door closes?|hinges?)\b/i,
    prompt: "wooden door creak in a quiet room, no voices, no music",
    durationSeconds: 1.5,
    gain: 0.44,
    score: 4
  },
  {
    name: "scrape",
    pattern: /\b(scrapes?|drags?|slides?|shuffles?)\b/i,
    prompt: "object scraping lightly across a surface, no voices, no music",
    durationSeconds: 1.3,
    gain: 0.41,
    score: 3
  },
  {
    name: "reaction",
    pattern: /\b(sighs?|gasps?|laughs?|giggles?|chuckles?|yips?|yelps?)\b/i,
    prompt: "soft nonverbal human reaction sound, no spoken words, no music",
    durationSeconds: 0.9,
    gain: 0.34,
    score: 2
  },
  {
    name: "vehicle",
    pattern:
      /\b(vroom|rev(?:s|ving)?|engine(?:\s+\w+){0,2}\s+(?:revs?|rumbles?|growls?|roars?)|car starts?|tires? squeal|road[- ]?trip)\b/i,
    prompt: "brief playful car engine rev, no voices, no music",
    durationSeconds: 1.2,
    gain: 0.46,
    score: 3
  },
  {
    name: "radio",
    pattern:
      /\b(radio|station|stereo|speakers?|music (?:starts?|plays?|blasts?|drifts?)|song comes on|turns? (?:up|down) the volume)\b/i,
    prompt: "car radio clicking and music starting from dashboard speakers, no voices, no music",
    durationSeconds: 1.4,
    gain: 0.42,
    score: 3
  }
];

function normalizeSegmentText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const MAX_NARRATION_EFFECT_OFFSET_MS = 8000;
const NARRATION_EFFECT_SENTENCE_PADDING_MS = 80;

export function extractDelimitedNarrationSegments(
  text: string,
  delimiter = "*"
): NarrationSegment[] {
  const normalizedDelimiter = delimiter.trim() || "*";
  const pattern = new RegExp(
    `${escapeRegExp(normalizedDelimiter)}([\\s\\S]*?)${escapeRegExp(normalizedDelimiter)}`,
    "g"
  );
  const matches: NarrationSegment[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const normalized = normalizeSegmentText(match[1] ?? "");
    if (normalized) {
      matches.push({
        text: normalized,
        rawSpanStart: match.index,
        rawSpanEnd: match.index + match[0].length
      });
    }
  }

  return matches;
}

export function selectKindroidNarrationEffect(
  text: string,
  delimiter = "*"
): SelectedNarrationEffect | null {
  const segments = extractDelimitedNarrationSegments(text, delimiter);
  let selected: SelectedNarrationEffect | null = null;
  let selectedScore = -1;

  for (const segment of segments) {
    if (segment.text.length < 4 || segment.text.length > 180) {
      continue;
    }

    const normalized = normalizeSegmentText(segment.text);
    if (!normalized) {
      continue;
    }

    const matchedPatterns = AUDIBLE_PATTERNS.filter(({ pattern }) => pattern.test(normalized));
    const hasAudibleCue = matchedPatterns.length > 0;
    if (!hasAudibleCue) {
      continue;
    }

    const bestPattern = matchedPatterns.sort((left, right) => right.score - left.score)[0] ?? null;
    if (!bestPattern) {
      continue;
    }

    let score = bestPattern.score;
    if (normalized.split(/\s+/).length > 12) {
      score -= 1;
    }
    if (/\b(noise|sound|echo|crack|creak|thud|clink|rustle|footsteps?|thunder)\b/i.test(normalized)) {
      score += 1;
    }

    if (score <= selectedScore) {
      continue;
    }

    selectedScore = score;
    selected = {
      sourceText: normalized,
      prompt: `${bestPattern.prompt}. Inspired by: ${normalized}`,
      durationSeconds: bestPattern.durationSeconds,
      promptInfluence: 0.55,
      gain: bestPattern.gain,
      rawSpanStart: segment.rawSpanStart,
      rawSpanEnd: segment.rawSpanEnd
    };
  }

  return selected;
}

export function describeKindroidNarrationEffects(
  text: string,
  delimiter = "*"
): NarrationEffectDiagnostic[] {
  return extractDelimitedNarrationSegments(text, delimiter).map((segment) => ({
    text: segment.text,
    matchedPatterns: AUDIBLE_PATTERNS.filter(({ pattern }) => pattern.test(segment.text)).map(
      ({ name }) => name
    )
  }));
}

export function computeNarrationEffectOffsetMs(options: {
  rawText: string;
  speechText: string;
  effect: SelectedNarrationEffect;
  speechDurationMs: number;
  delimiter?: string;
}): number {
  const { rawText, speechText, effect, speechDurationMs, delimiter = "*" } = options;

  if (!speechText.trim() || speechDurationMs <= 0) {
    return 0;
  }

  const beforeNarration = rawText.slice(0, effect.rawSpanStart);
  const escapedDelimiter = escapeRegExp(delimiter.trim() || "*");
  const spokenPrefix = beforeNarration
    .replace(new RegExp(`${escapedDelimiter}[\\s\\S]*?${escapedDelimiter}`, "g"), " ")
    .replace(/[^\S\r\n]+/g, " ");
  const spokenCharsBefore = normalizeSegmentText(spokenPrefix).length;
  const totalSpokenChars = normalizeSegmentText(speechText).length;

  if (totalSpokenChars <= 0) {
    return 0;
  }

  const ratio = Math.min(1, Math.max(0, spokenCharsBefore / totalSpokenChars));
  const offsetMs = Math.round(speechDurationMs * ratio);
  return Math.min(MAX_NARRATION_EFFECT_OFFSET_MS, offsetMs);
}

export function snapNarrationEffectOffsetToCaptionBoundary(
  offsetMs: number,
  cues: SpeechCaptionCue[]
): number {
  if (offsetMs <= 0 || cues.length === 0) {
    return offsetMs;
  }

  const containingCue = cues.find((cue) => offsetMs >= cue.startMs && offsetMs < cue.endMs);
  if (!containingCue) {
    return offsetMs;
  }

  return Math.min(
    MAX_NARRATION_EFFECT_OFFSET_MS,
    containingCue.endMs + NARRATION_EFFECT_SENTENCE_PADDING_MS
  );
}
