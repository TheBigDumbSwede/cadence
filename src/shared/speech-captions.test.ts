import { describe, expect, it } from "vitest";
import {
  buildAlignedSpeechCaptionCues,
  findActiveSpeechCaptionCue,
  estimateSpeechCaptionCues,
  scaleSpeechCaptionCues,
  splitSentenceSpans
} from "./speech-captions";

describe("speech captions", () => {
  it("splits text into sentence spans", () => {
    expect(splitSentenceSpans("Hello there. General Kenobi!\nStill here?")).toEqual([
      expect.objectContaining({ text: "Hello there." }),
      expect.objectContaining({ text: "General Kenobi!" }),
      expect.objectContaining({ text: "Still here?" })
    ]);
  });

  it("builds aligned sentence cues from character timing", () => {
    const text = "Hello there. General Kenobi!";
    const starts = text.split("").map((_, index) => index * 100);
    const ends = text.split("").map((_, index) => index * 100 + 80);

    expect(
      buildAlignedSpeechCaptionCues({
        text,
        characterStartTimesMs: starts,
        characterEndTimesMs: ends
      })
    ).toEqual([
      {
        text: "Hello there.",
        startMs: 0,
        endMs: 1180
      },
      {
        text: "General Kenobi!",
        startMs: 1300,
        endMs: 2780
      }
    ]);
  });

  it("estimates cues when alignment data is unavailable", () => {
    const cues = estimateSpeechCaptionCues("One short line. Another short line.");

    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(0);
    expect(cues[1].startMs).toBeGreaterThan(cues[0].startMs);
    expect(cues[1].endMs).toBeGreaterThan(cues[1].startMs);
  });

  it("rescales estimated cues to match actual audio duration", () => {
    const cues = scaleSpeechCaptionCues(
      [
        { text: "First.", startMs: 0, endMs: 1000 },
        { text: "Second.", startMs: 1000, endMs: 2000 }
      ],
      3000
    );

    expect(cues).toEqual([
      { text: "First.", startMs: 0, endMs: 1500 },
      { text: "Second.", startMs: 1500, endMs: 3000 }
    ]);
  });

  it("finds the active cue for a playback position", () => {
    const cue = findActiveSpeechCaptionCue(
      [
        { text: "First.", startMs: 0, endMs: 1200 },
        { text: "Second.", startMs: 1200, endMs: 2400 }
      ],
      1500
    );

    expect(cue).toEqual({
      text: "Second.",
      startMs: 1200,
      endMs: 2400
    });
  });
});
