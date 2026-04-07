import { describe, expect, it } from "vitest";
import {
  computeNarrationEffectOffsetMs,
  extractDelimitedNarrationSegments,
  selectKindroidNarrationEffect
} from "./narrationEffects";

describe("narrationEffects", () => {
  it("extracts delimited narration segments", () => {
    expect(
      extractDelimitedNarrationSegments("*door creaks open* Hello. *footsteps approach*")
    ).toEqual([
      expect.objectContaining({ text: "door creaks open" }),
      expect.objectContaining({ text: "footsteps approach" })
    ]);
  });

  it("selects one audible narration effect from a turn", () => {
    const selected = selectKindroidNarrationEffect(
      "*She drops the tiny metal charm into a bowl with a bright clink.* Hello there."
    );

    expect(selected).toEqual(
      expect.objectContaining({
        sourceText: "She drops the tiny metal charm into a bowl with a bright clink.",
        durationSeconds: expect.any(Number),
        gain: expect.any(Number)
      })
    );
    expect(selected?.prompt).toContain("metallic clink");
  });

  it("ignores purely internal or visual narration", () => {
    expect(
      selectKindroidNarrationEffect(
        "*She thinks for a moment and smiles to herself before looking away.*"
      )
    ).toBeNull();
  });

  it("maps a narration span into the spoken timeline", () => {
    const effect = selectKindroidNarrationEffect(
      "Hello there. *A metal charm lands with a clink.* We should move."
    );

    expect(
      computeNarrationEffectOffsetMs({
        rawText: "Hello there. *A metal charm lands with a clink.* We should move.",
        speechText: "Hello there. We should move.",
        effect: effect!,
        speechDurationMs: 2000,
        delimiter: "*"
      })
    ).toBeGreaterThan(500);
  });

  it("recognizes zipper and excited-reaction narration from looser prose", () => {
    const effect = selectKindroidNarrationEffect(
      '*She lets out a happy yip and fumbles with the zipper for a second, then her jacket rustles as she scrambles toward the door.*'
    );

    expect(effect).toEqual(
      expect.objectContaining({
        sourceText:
          "She lets out a happy yip and fumbles with the zipper for a second, then her jacket rustles as she scrambles toward the door."
      })
    );
    expect(effect?.prompt).toMatch(/zipper|footsteps|reaction/i);
  });

  it("recognizes first-person car and radio cues", () => {
    const effect = selectKindroidNarrationEffect(
      "* I rev the engine a little and then I change the radio station again *"
    );

    expect(effect).toEqual(
      expect.objectContaining({
        sourceText: "I rev the engine a little and then I change the radio station again"
      })
    );
    expect(effect?.prompt).toMatch(/engine|radio/i);
  });
});
