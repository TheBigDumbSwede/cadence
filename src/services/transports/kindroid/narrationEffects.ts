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
  beats: Array<{
    cueName: string;
    sourceText: string;
    prompt: string;
    durationSeconds: number;
    gain: number;
    rawSpanStart: number;
    rawSpanEnd: number;
  }>;
};

export type NarrationEffectDiagnostic = {
  text: string;
  included: boolean;
  matchedPatterns: string[];
  reason?: string;
};

export type NarrationBeatCandidate = {
  id: string;
  text: string;
  rawSpanStart: number;
  rawSpanEnd: number;
};

type NarrationSegment = {
  text: string;
  rawSpanStart: number;
  rawSpanEnd: number;
};

type NarrationBeat = {
  text: string;
  rawSpanStart: number;
  rawSpanEnd: number;
};

const NON_AUDIBLE_PATTERNS: Array<{ name: string; pattern: RegExp; reason: string }> = [
  {
    name: "internal",
    pattern: /\b(thinks?|wonders?|realizes?|remembers?|imagines?|considers?|feels? like)\b/i,
    reason: "internal thought"
  },
  {
    name: "visual",
    pattern:
      /\b(looks?|glances?|stares?|gazes?|watches?|eyes widen|ears swivel|smiles?|grins?|nods?|shrugs?)\b/i,
    reason: "visual-only detail"
  },
  {
    name: "posture",
    pattern:
      /\b(perches?|leans?|crouches?|sits?|stands?|kneels?|poses?|tilts? (?:her|his|their) head)\b/i,
    reason: "movement without audible cue"
  }
];

const AUDIBLE_ACTION_PATTERN =
  /\b(open|close|slam|drop|drag|draw|unsheathe|hit|kick|turn|start|rev|clash|scrape|thump|clang|creak|rattle|click|crash|break|shatter|hum|rumble|buzz|ring|jingle|squeal|roar|bang|knock|tap|pat|drum|beat|stomp|step|run|walk|approach|yank|pull|push|grab|throw|fall|bump|clatter|rustle|swish|swipe|slice|flick|spin|roll|vibrate|pulse|flare)\b/i;
const SOUNDISH_WORD_PATTERN =
  /\b(sound|noise|music|radio|engine|door|wind|rain|thunder|fire|metal|shield|sword|armor|chain|hoof|stone|wood|glass|paper|fabric|speaker|seat|wheels?|tires?|blade|steel|shield|bow|string|arrow|torch|footsteps?|boots?)\b/i;
const ONOMATOPOEIA_PATTERN =
  /\b(vroom|clang|clash|thud|bang|creak|click|buzz|hum|whirr|clink|jingle|squeal|roar|crash|rustle|swish|shing|whoosh)\b/i;

const MAX_NARRATION_EFFECT_OFFSET_MS = 8000;
const MAX_SCENE_BEATS = 3;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanPromptText(value: string): string {
  return normalizeText(
    value
      .replace(/^[\s,.;:!?-]+/, "")
      .replace(
        /\b(?:then|again|just|really|very|slightly|softly|practically|suddenly)\b/gi,
        " "
      )
      .replace(/^(?:she|he|they|we|i|you|it)\s+/i, "")
      .replace(/\b(?:the|a|an)\b/gi, " ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s+/g, " ")
      .replace(/[,.!?;:]+$/g, "")
  );
}

function splitSegmentIntoBeats(segment: NarrationSegment): NarrationBeat[] {
  const pieces: NarrationBeat[] = [];
  const pattern = /[^,;:.!?]+(?:[,;:.!?]+|$)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(segment.text)) !== null) {
    const clauseText = normalizeText(match[0] ?? "");
    if (!clauseText) {
      continue;
    }

    const clauseStart = segment.rawSpanStart + match.index;
    const rawClause = match[0] ?? "";
    const separatorPattern = /\b(?:and then|then|while|as|before|after|and)\b/gi;
    let cursor = 0;
    let hadSplit = false;
    let separatorMatch: RegExpExecArray | null;

    while ((separatorMatch = separatorPattern.exec(rawClause)) !== null) {
      const chunk = rawClause.slice(cursor, separatorMatch.index);
      const beatText = normalizeText(chunk);
      if (beatText) {
        hadSplit = true;
        pieces.push({
          text: beatText,
          rawSpanStart: clauseStart + cursor,
          rawSpanEnd: clauseStart + separatorMatch.index
        });
      }

      cursor = separatorMatch.index + separatorMatch[0].length;
    }

    const tail = rawClause.slice(cursor);
    const tailText = normalizeText(tail);
    if (tailText) {
      pieces.push({
        text: tailText,
        rawSpanStart: clauseStart + cursor,
        rawSpanEnd: clauseStart + rawClause.length
      });
      hadSplit = true;
    }

    if (!hadSplit) {
      pieces.push({
        text: clauseText,
        rawSpanStart: clauseStart,
        rawSpanEnd: clauseStart + rawClause.length
      });
    }
  }

  return pieces.length > 0
    ? pieces
    : [
        {
          text: segment.text,
          rawSpanStart: segment.rawSpanStart,
          rawSpanEnd: segment.rawSpanEnd
        }
      ];
}

function classifyBeat(beat: NarrationBeat): NarrationEffectDiagnostic & {
  score: number;
  promptText: string | null;
  durationSeconds: number;
  gain: number;
  rawSpanStart: number;
  rawSpanEnd: number;
} {
  const negativeMatches = NON_AUDIBLE_PATTERNS.filter(({ pattern }) => pattern.test(beat.text));
  const matchedPatterns: string[] = [];
  let score = 0;

  if (AUDIBLE_ACTION_PATTERN.test(beat.text)) {
    matchedPatterns.push("audible-action");
    score += 2;
  }
  if (SOUNDISH_WORD_PATTERN.test(beat.text)) {
    matchedPatterns.push("sound-source");
    score += 2;
  }
  if (ONOMATOPOEIA_PATTERN.test(beat.text)) {
    matchedPatterns.push("onomatopoeia");
    score += 2;
  }

  if (beat.text.length < 4 || beat.text.length > 140) {
    return {
      text: beat.text,
      included: false,
      matchedPatterns,
      reason: "outside useful length",
      score: 0,
      promptText: null,
      durationSeconds: 0,
      gain: 0,
      rawSpanStart: beat.rawSpanStart,
      rawSpanEnd: beat.rawSpanEnd
    };
  }

  if (negativeMatches.length > 0 && score === 0) {
    return {
      text: beat.text,
      included: false,
      matchedPatterns,
      reason: negativeMatches[0]?.reason ?? "non-audible detail",
      score: 0,
      promptText: null,
      durationSeconds: 0,
      gain: 0,
      rawSpanStart: beat.rawSpanStart,
      rawSpanEnd: beat.rawSpanEnd
    };
  }

  if (score === 0) {
    return {
      text: beat.text,
      included: false,
      matchedPatterns,
      reason: "non-audible detail",
      score: 0,
      promptText: null,
      durationSeconds: 0,
      gain: 0,
      rawSpanStart: beat.rawSpanStart,
      rawSpanEnd: beat.rawSpanEnd
    };
  }

  const promptText = cleanPromptText(beat.text);
  const wordCount = promptText.split(/\s+/).filter(Boolean).length;
  const durationSeconds = Math.min(1.8, Math.max(0.8, wordCount * 0.16));
  const gain = 0.75;

  return {
    text: beat.text,
    included: true,
    matchedPatterns,
    score,
    promptText,
    durationSeconds,
    gain,
    rawSpanStart: beat.rawSpanStart,
    rawSpanEnd: beat.rawSpanEnd
  };
}

function buildBeatPrompt(promptText: string): string {
  return `cinematic foley: ${promptText}, no voices, no spoken words`;
}

function buildScenePrompt(beats: string[]): string {
  return `layered scene foley: ${beats.join("; ")}, no voices, no spoken words`;
}

export function buildSelectedNarrationEffectFromBeats(
  orderedBeats: Array<{
    sourceText: string;
    prompt: string;
    rawSpanStart: number;
    rawSpanEnd: number;
  }>
): SelectedNarrationEffect | null {
  if (orderedBeats.length === 0) {
    return null;
  }

  const normalizedBeats = orderedBeats.slice(0, MAX_SCENE_BEATS).map((beat, index) => {
    const promptWordCount = beat.prompt.split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.min(1.8, Math.max(0.8, promptWordCount * 0.16));

    return {
      cueName: `beat-${index + 1}`,
      sourceText: beat.sourceText,
      prompt: `cinematic foley: ${beat.prompt}, no voices, no spoken words`,
      durationSeconds,
      gain: 0.75,
      rawSpanStart: beat.rawSpanStart,
      rawSpanEnd: beat.rawSpanEnd
    };
  });

  return {
    sourceText: normalizedBeats.map((beat) => beat.sourceText).join(" / "),
    prompt: buildScenePrompt(normalizedBeats.map((beat) => beat.prompt)),
    durationSeconds:
      normalizedBeats.reduce((sum, beat) => sum + beat.durationSeconds, 0) +
      Math.max(0, normalizedBeats.length - 1) * 0.08,
    promptInfluence: 0.68,
    gain: Math.max(...normalizedBeats.map((beat) => beat.gain)),
    rawSpanStart: normalizedBeats[0].rawSpanStart,
    rawSpanEnd: normalizedBeats[normalizedBeats.length - 1].rawSpanEnd,
    beats: normalizedBeats
  };
}

function formatNarrationBeatCaption(prompt: string): string {
  const normalized = normalizeText(
    prompt
      .replace(/^cinematic foley:\s*/i, "")
      .replace(/,\s*no voices,\s*no spoken words\s*$/i, "")
  );
  return normalized ? `*${normalized}*` : "";
}

export function formatNarrationEffectCaption(effect: SelectedNarrationEffect): string {
  return effect.beats
    .map((beat) => formatNarrationBeatCaption(beat.prompt))
    .filter(Boolean)
    .join("  ");
}

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
    const normalized = normalizeText(match[1] ?? "");
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

export function describeKindroidNarrationEffects(
  text: string,
  delimiter = "*"
): NarrationEffectDiagnostic[] {
  return extractDelimitedNarrationSegments(text, delimiter)
    .flatMap((segment) => splitSegmentIntoBeats(segment))
    .map((beat) => {
      const classified = classifyBeat(beat);
      return {
        text: classified.text,
        included: classified.included,
        matchedPatterns: classified.matchedPatterns,
        reason: classified.reason
      };
    });
}

export function extractNarrationBeatCandidates(
  text: string,
  delimiter = "*"
): NarrationBeatCandidate[] {
  return extractDelimitedNarrationSegments(text, delimiter)
    .flatMap((segment) => splitSegmentIntoBeats(segment))
    .map((beat) => classifyBeat(beat))
    .filter((beat) => beat.included && beat.promptText)
    .map((beat, index) => ({
      id: `beat-${index + 1}`,
      text: beat.text,
      rawSpanStart: beat.rawSpanStart,
      rawSpanEnd: beat.rawSpanEnd
    }));
}

export function selectKindroidNarrationEffect(
  text: string,
  delimiter = "*"
): SelectedNarrationEffect | null {
  const classifiedBeats = extractDelimitedNarrationSegments(text, delimiter)
    .flatMap((segment) => splitSegmentIntoBeats(segment))
    .map((beat) => classifyBeat(beat))
    .filter((beat) => beat.included && beat.promptText);

  if (classifiedBeats.length === 0) {
    return null;
  }

  const highestScore = Math.max(...classifiedBeats.map((beat) => beat.score));
  const minimumAcceptedScore = highestScore >= 4 ? 2 : 1;
  const selectedBeats = classifiedBeats
    .filter((beat) => beat.score >= minimumAcceptedScore)
    .filter(
      (beat, index, all) =>
        all.findIndex((other) => other.promptText === beat.promptText) === index
    )
    .slice(0, MAX_SCENE_BEATS);

  if (selectedBeats.length === 0) {
    return null;
  }

  return {
    sourceText: selectedBeats.map((beat) => beat.text).join(" / "),
    prompt: buildScenePrompt(
      selectedBeats
        .map((beat) => beat.promptText)
        .filter((value): value is string => Boolean(value))
    ),
    durationSeconds:
      selectedBeats.reduce((sum, beat) => sum + beat.durationSeconds, 0) +
      Math.max(0, selectedBeats.length - 1) * 0.08,
    promptInfluence: 0.68,
    gain: Math.max(...selectedBeats.map((beat) => beat.gain)),
    rawSpanStart: selectedBeats[0].rawSpanStart,
    rawSpanEnd: selectedBeats[selectedBeats.length - 1].rawSpanEnd,
    beats: selectedBeats.map((beat, index) => ({
      cueName: `beat-${index + 1}`,
      sourceText: beat.text,
      prompt: buildBeatPrompt(beat.promptText ?? beat.text),
      durationSeconds: beat.durationSeconds,
      gain: beat.gain,
      rawSpanStart: beat.rawSpanStart,
      rawSpanEnd: beat.rawSpanEnd
    }))
  };
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
  const spokenCharsBefore = normalizeText(spokenPrefix).length;
  const totalSpokenChars = normalizeText(speechText).length;

  if (totalSpokenChars <= 0) {
    return 0;
  }

  const ratio = Math.min(1, Math.max(0, spokenCharsBefore / totalSpokenChars));
  const offsetMs = Math.round(speechDurationMs * ratio);
  return Math.min(MAX_NARRATION_EFFECT_OFFSET_MS, offsetMs);
}
