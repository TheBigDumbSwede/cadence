import type { TextBridge } from "../../../shared/text-control";
import type { NarrationBeatCandidate } from "./narrationEffects";

const NARRATION_BEAT_MODEL = "gpt-5-nano";
const MAX_NARRATION_BEATS = 3;

type NarrationBeatSelection = {
  beats: Array<{
    id: string;
    prompt: string;
  }>;
};

function extractFirstJsonObject(value: string): string | null {
  const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return value.slice(start, end + 1);
}

function parseNarrationBeatSelection(value: string): NarrationBeatSelection | null {
  const json = extractFirstJsonObject(value);
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as Partial<NarrationBeatSelection>;
    if (!Array.isArray(parsed.beats)) {
      return null;
    }

    return {
      beats: parsed.beats
        .filter(
          (beat): beat is { id: string; prompt: string } =>
            Boolean(beat && typeof beat.id === "string" && typeof beat.prompt === "string")
        )
        .map((beat) => ({
          id: beat.id,
          prompt: beat.prompt.trim()
        }))
        .filter((beat) => beat.id.length > 0 && beat.prompt.length > 0)
        .slice(0, MAX_NARRATION_BEATS)
    };
  } catch {
    return null;
  }
}

function buildNarrationBeatInput(candidates: NarrationBeatCandidate[]): string {
  const lines = candidates
    .slice(0, 12)
    .map((candidate) => `${candidate.id}: ${candidate.text}`)
    .join("\n");

  return `Candidate narration clauses:\n${lines}`;
}

const NARRATION_BEAT_INSTRUCTIONS = [
  "You extract short audible sound-design beats from narration.",
  "Select at most 3 items.",
  "Only keep externally audible events or sound sources.",
  "Exclude internal thought, visual-only description, emotion without sound, and dialogue.",
  "Preserve source order.",
  'Return strict JSON only in the form {"beats":[{"id":"beat-1","prompt":"short sound brief"}]}.',
  "Each prompt must be 2 to 8 words, describe only the sound, and never mention voices or dialogue."
].join(" ");

export async function extractNarrationBeatsWithOpenAi(
  textBridge: TextBridge,
  candidates: NarrationBeatCandidate[]
): Promise<Array<{ id: string; prompt: string }> | null> {
  if (candidates.length === 0) {
    return [];
  }

  const response = await textBridge.createResponse(buildNarrationBeatInput(candidates), {
    instructions: NARRATION_BEAT_INSTRUCTIONS,
    model: NARRATION_BEAT_MODEL
  });
  const parsed = parseNarrationBeatSelection(response.text);
  if (!parsed) {
    return null;
  }

  const allowedIds = new Set(candidates.map((candidate) => candidate.id));
  const seenIds = new Set<string>();

  return parsed.beats.filter((beat) => {
    if (!allowedIds.has(beat.id) || seenIds.has(beat.id)) {
      return false;
    }

    seenIds.add(beat.id);
    return true;
  });
}
