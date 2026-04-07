import { describe, expect, it } from "vitest";
import { stripKindroidNarrationForSpeech } from "./speechText";

describe("stripKindroidNarrationForSpeech", () => {
  it("strips delimited narration while preserving paragraph breaks", () => {
    const result = stripKindroidNarrationForSpeech(
      "*She leans closer.* Hello there.\n\n*She smirks.* We should leave.",
      { enabled: true, delimiter: "*" }
    );

    expect(result).toBe("Hello there.\n\nWe should leave.");
  });

  it("keeps narration content when filtering is disabled but removes delimiters", () => {
    const result = stripKindroidNarrationForSpeech(
      "*She leans closer.* Hello there.  *Quietly.*",
      { enabled: false, delimiter: "*" }
    );

    expect(result).toBe("She leans closer. Hello there. Quietly.");
  });

  it("supports custom narration delimiters", () => {
    const result = stripKindroidNarrationForSpeech(
      "~She leans closer.~ Hello there. ~Quietly.~",
      { enabled: true, delimiter: "~" }
    );

    expect(result).toBe("Hello there.");
  });
});
