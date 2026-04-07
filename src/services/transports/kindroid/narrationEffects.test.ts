import { describe, expect, it } from "vitest";
import {
  computeNarrationEffectOffsetMs,
  describeKindroidNarrationEffects,
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

  it("builds a layered scene prompt from multiple audible beats", () => {
    const selected = selectKindroidNarrationEffect(
      "*She pats the dashboard as the engine rumbles to life, then the radio clicks and music starts while her tail thumps against the seat.*"
    );

    expect(selected).toEqual(
      expect.objectContaining({
        sourceText: expect.stringContaining("engine rumbles to life"),
        durationSeconds: expect.any(Number),
        gain: expect.any(Number)
      })
    );
    expect(selected?.prompt).toContain("engine rumbles to life");
    expect(selected?.prompt).toContain("radio clicks");
    expect(selected?.prompt).not.toContain("upholstery");
  });

  it("filters out purely internal or visual narration", () => {
    expect(
      selectKindroidNarrationEffect(
        "*She thinks for a moment and smiles to herself before looking away.*"
      )
    ).toBeNull();
  });

  it("reports excluded visual clauses in diagnostics", () => {
    const diagnostics = describeKindroidNarrationEffects(
      "*She smiles at you, then the radio clicks and music starts.*"
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          included: false,
          reason: expect.stringContaining("visual")
        }),
        expect.objectContaining({
          included: true,
          matchedPatterns: expect.arrayContaining(["sound-source"])
        })
      ])
    );
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

  it("recognizes zipper and scrambling narration from looser prose", () => {
    const effect = selectKindroidNarrationEffect(
      '*She lets out a happy yip and fumbles with the zipper for a second, then her jacket rustles as she scrambles toward the door.*'
    );

    expect(effect?.sourceText).toMatch(/zipper|scrambles/i);
    expect(effect?.prompt).toMatch(/zipper|scrambles|rustles/i);
  });

  it("keeps first-person car and radio cues together instead of picking one token", () => {
    const effect = selectKindroidNarrationEffect(
      "* I rev the engine a little and then I change the radio station again *"
    );

    expect(effect?.sourceText).toContain(
      "I rev the engine a little"
    );
    expect(effect?.prompt).toContain("rev engine");
    expect(effect?.prompt).toContain("change radio station");
  });

  it("drops weak upholstery filler when stronger radio and engine cues exist", () => {
    const effect = selectKindroidNarrationEffect(
      "*The radio clicks, music starts from the speakers, the engine rumbles to life, and her tail thumps against the seat.*"
    );

    expect(effect?.prompt).toContain("radio click");
    expect(effect?.prompt).toContain("engine rumble");
    expect(effect?.prompt).not.toContain("upholstery");
    expect(effect?.prompt).not.toContain("environmental sound detail");
  });
});
