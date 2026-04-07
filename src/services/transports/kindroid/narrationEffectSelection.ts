import type { TextBridge } from "../../../shared/text-control";
import {
  buildSelectedNarrationEffectFromBeats,
  extractNarrationBeatCandidates,
  type SelectedNarrationEffect,
  selectKindroidNarrationEffect
} from "./narrationEffects";
import { extractNarrationBeatsWithOpenAi } from "./openAiNarrationBeats";

function buildSelectedEffectFromAiBeats(
  aiBeats: Array<{ id: string; prompt: string }>,
  candidateBeats: ReturnType<typeof extractNarrationBeatCandidates>
): SelectedNarrationEffect | null {
  const beatsWithSpans = aiBeats
    .map((beat) => {
      const candidate = candidateBeats.find((candidateBeat) => candidateBeat.id === beat.id);
      if (!candidate) {
        return null;
      }

      return {
        sourceText: candidate.text,
        prompt: beat.prompt,
        rawSpanStart: candidate.rawSpanStart,
        rawSpanEnd: candidate.rawSpanEnd
      };
    })
    .filter((beat): beat is NonNullable<typeof beat> => Boolean(beat));

  return buildSelectedNarrationEffectFromBeats(beatsWithSpans);
}

export async function selectNarrationEffectWithModel(
  textBridge: TextBridge,
  text: string,
  delimiter: string
): Promise<SelectedNarrationEffect | null> {
  const candidateBeats = extractNarrationBeatCandidates(text, delimiter);

  try {
    const aiBeats = await extractNarrationBeatsWithOpenAi(textBridge, candidateBeats);
    if (aiBeats && aiBeats.length > 0) {
      const selectedEffect = buildSelectedEffectFromAiBeats(aiBeats, candidateBeats);
      if (selectedEffect) {
        return selectedEffect;
      }
    }
  } catch {
    // Fall through to the local heuristic when the fast model path fails.
  }

  return selectKindroidNarrationEffect(text, delimiter);
}

export async function selectNarrationEffectFromDelimitersWithModel(
  textBridge: TextBridge,
  text: string,
  delimiters: string[]
): Promise<{
  selectedDelimiter: string | null;
  effect: SelectedNarrationEffect | null;
}> {
  for (const delimiter of delimiters) {
    const effect = await selectNarrationEffectWithModel(textBridge, text, delimiter);
    if (effect) {
      return {
        selectedDelimiter: delimiter,
        effect
      };
    }
  }

  return {
    selectedDelimiter: null,
    effect: null
  };
}
