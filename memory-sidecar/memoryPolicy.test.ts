import { describe, expect, it } from "vitest";
import type { MemoryRecallRequest } from "../src/shared/memory-control";
import type { StoredMemory } from "./MemoryStore";
import { buildRecallResult, extractMemoryCandidates, tokenize } from "./memoryPolicy";

function createStoredMemory(
  overrides: Partial<StoredMemory> & Pick<StoredMemory, "id" | "type" | "text" | "keywords">
): StoredMemory {
  return {
    profileId: "default",
    createdAt: "2026-04-08T12:00:00.000Z",
    updatedAt: "2026-04-08T12:00:00.000Z",
    lastConversationId: "conv-1",
    participantIds: [],
    sourceCount: 1,
    ...overrides
  };
}

function createRecallRequest(
  recentTurns: MemoryRecallRequest["recentTurns"]
): MemoryRecallRequest {
  return {
    scope: {
      profileId: "default",
      conversationId: "conv-1",
      backend: "openai-responses",
      participantIds: ["kin-1"]
    },
    recentTurns,
    maxItems: 6,
    maxTokens: 100
  };
}

describe("memoryPolicy", () => {
  it("extracts useful memory categories from explicit and implied user context", () => {
    const candidates = extractMemoryCandidates([
      { role: "user", text: "Please keep replies concise." },
      { role: "user", text: "I use a Shure MV7." },
      { role: "user", text: "I'm working on a memory sidecar for Cadence." },
      { role: "user", text: "The issue is that dev doesn't start the sidecar." },
      { role: "assistant", text: "Noted." }
    ]);

    expect(candidates).toEqual([
      {
        type: "preference",
        text: "User prefers replies that are concise.",
        keywords: ["concise"]
      },
      {
        type: "fact",
        text: "User uses a Shure MV7.",
        keywords: ["shure", "mv7"]
      },
      {
        type: "project",
        text: "Current project context: a memory sidecar for Cadence.",
        keywords: ["memory", "sidecar", "cadence"]
      },
      {
        type: "thread",
        text: "Open issue: that dev doesn't start the sidecar.",
        keywords: ["dev", "doesn", "start", "sidecar"]
      }
    ]);
  });

  it("ignores generic conversational residue instead of storing transcript sludge", () => {
    const candidates = extractMemoryCandidates([
      { role: "user", text: "Good morning." },
      { role: "user", text: "How are you?" },
      { role: "user", text: "Thanks, that helps." },
      { role: "assistant", text: "You're welcome." }
    ]);

    expect(candidates).toEqual([]);
  });

  it("deduplicates repeated memory candidates", () => {
    const candidates = extractMemoryCandidates([
      { role: "user", text: "I prefer short answers." },
      { role: "user", text: "I prefer short answers." },
      { role: "user", text: "Please keep replies short." }
    ]);

    expect(candidates).toHaveLength(2);
    expect(candidates).toEqual(
      expect.arrayContaining([
        {
          type: "preference",
          text: "User prefers short answers.",
          keywords: ["short", "answers"]
        },
        {
          type: "preference",
          text: "User prefers replies that are short.",
          keywords: ["short"]
        }
      ])
    );
  });

  it("recalls relevant memories and excludes old session-style residue", () => {
    const result = buildRecallResult(
      createRecallRequest([
        { role: "user", text: "What mic am I using? Please answer briefly." }
      ]),
      [
        createStoredMemory({
          id: "mem-preference",
          type: "preference",
          text: "User prefers concise replies.",
          keywords: ["concise", "brief", "replies"],
          sourceCount: 3
        }),
        createStoredMemory({
          id: "mem-fact",
          type: "fact",
          text: "User uses a Shure MV7.",
          keywords: ["shure", "mv7", "uses"],
          sourceCount: 2
        }),
        createStoredMemory({
          id: "mem-session",
          type: "session",
          text: "Recent session topics: good morning and light chit-chat.",
          keywords: ["session", "topics"],
          sourceCount: 5
        })
      ]
    );

    expect(result.items.map((item) => item.id)).toEqual(["mem-preference", "mem-fact"]);
    expect(result.contextBlock).toBe(
      "Relevant memory:\n- User prefers concise replies.\n- User uses a Shure MV7."
    );
  });

  it("tokenizes user text into a stable keyword set", () => {
    expect(
      tokenize("Please keep replies concise, concise, and clear about the Shure MV7.")
    ).toEqual(["keep", "replies", "concise", "clear", "about", "shure", "mv7"]);
  });
});
