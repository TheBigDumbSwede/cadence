import type {
  MemoryItem,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryScope,
  MemoryTurn
} from "../src/shared/memory-control";
import type { StoredMemory, StoredSession } from "./MemoryStore";

type MemoryCandidate = {
  type: MemoryItem["type"];
  text: string;
  keywords: string[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your"
]);

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    )
  );
}

function toSentenceCase(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractPreference(text: string): MemoryCandidate | null {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();

  const preferMatch = normalized.match(/^i prefer (.+)$/i);
  if (preferMatch) {
    const detail = preferMatch[1].replace(/[.?!]+$/, "");
    return {
      type: "preference",
      text: `User prefers ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const styleMatch = normalized.match(
    /^(?:please\s+)?keep (?:your )?(?:repl(?:y|ies)|responses|answers) (.+)$/i
  );
  if (styleMatch) {
    const detail = styleMatch[1].replace(/[.?!]+$/, "");
    return {
      type: "preference",
      text: `User prefers replies that are ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const likesMatch = normalized.match(/^i (like|love|enjoy) (.+)$/i);
  if (likesMatch) {
    const detail = likesMatch[2].replace(/[.?!]+$/, "");
    return {
      type: "preference",
      text: `User likes ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const dislikeMatch = normalized.match(/^i (?:do not like|don't like|dislike|hate) (.+)$/i);
  if (dislikeMatch) {
    const detail = dislikeMatch[1].replace(/[.?!]+$/, "");
    return {
      type: "preference",
      text: `User dislikes ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  if (lower.includes("concise") || lower.includes("brief")) {
    return {
      type: "preference",
      text: "User prefers concise replies.",
      keywords: ["concise", "brief", "replies"]
    };
  }

  return null;
}

function extractIdentityFact(text: string): MemoryCandidate | null {
  const normalized = normalizeText(text);

  const callMeMatch = normalized.match(/^(?:call me|my name is) (.+)$/i);
  if (callMeMatch) {
    const detail = callMeMatch[1].replace(/[.?!]+$/, "");
    return {
      type: "fact",
      text: `User prefers to be called ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const usingMatch = normalized.match(/^i(?:'m| am)? using (.+)$/i);
  if (usingMatch) {
    const detail = usingMatch[1].replace(/[.?!]+$/, "");
    return {
      type: "fact",
      text: `User is using ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const useMatch = normalized.match(/^i use (.+)$/i);
  if (useMatch) {
    const detail = useMatch[1].replace(/[.?!]+$/, "");
    return {
      type: "fact",
      text: `User uses ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const liveMatch = normalized.match(/^i live in (.+)$/i);
  if (liveMatch) {
    const detail = liveMatch[1].replace(/[.?!]+$/, "");
    return {
      type: "fact",
      text: `User lives in ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  return null;
}

export function extractMemoryCandidates(turns: MemoryTurn[]): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];

  for (const turn of turns) {
    if (turn.role !== "user") {
      continue;
    }

    const preference = extractPreference(turn.text);
    if (preference) {
      candidates.push(preference);
    }

    const fact = extractIdentityFact(turn.text);
    if (fact) {
      candidates.push(fact);
    }
  }

  return candidates.filter((candidate) => candidate.keywords.length > 0);
}

export function buildSessionSummary(session: StoredSession): MemoryCandidate | null {
  const userTurns = session.recentTurns
    .filter((turn) => turn.role === "user")
    .map((turn) => normalizeText(turn.text))
    .filter(Boolean)
    .slice(-3);

  if (userTurns.length === 0) {
    return null;
  }

  const summary = userTurns.map((turn) => toSentenceCase(turn)).join(" ");
  return {
    type: "session",
    text: `Recent session topics: ${summary}`,
    keywords: tokenize(summary)
  };
}

function scoreMemory(
  memory: StoredMemory,
  queryTokens: string[],
  scope: MemoryScope
): number {
  const overlap = memory.keywords.filter((keyword) => queryTokens.includes(keyword)).length;
  const participantOverlap = memory.participantIds.some((id) =>
    (scope.participantIds ?? []).includes(id)
  );

  let score = overlap * 2;
  if (memory.lastConversationId === scope.conversationId) {
    score += 1.5;
  }
  if (participantOverlap) {
    score += 1;
  }
  if (memory.type === "preference") {
    score += 0.5;
  }
  if (memory.type === "session") {
    score += 0.25;
  }

  return score;
}

function approximateTokenCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function buildRecallResult(
  request: MemoryRecallRequest,
  memories: StoredMemory[]
): MemoryRecallResult {
  const queryText = request.recentTurns.map((turn) => turn.text).join(" ");
  const queryTokens = tokenize(queryText);
  const maxItems = request.maxItems ?? 6;
  const maxTokens = request.maxTokens ?? 400;

  const ranked = memories
    .map((memory) => ({
      memory,
      score: scoreMemory(memory, queryTokens, request.scope)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.memory.sourceCount - left.memory.sourceCount)
    .slice(0, maxItems);

  const items = ranked.map((entry) => ({
    id: entry.memory.id,
    type: entry.memory.type,
    text: entry.memory.text,
    score: entry.score,
    lastUpdatedAt: entry.memory.updatedAt
  }));

  let tokenBudget = 0;
  const lines: string[] = [];
  for (const item of items) {
    const line = `- ${item.text}`;
    const lineTokens = approximateTokenCount(line);
    if (tokenBudget + lineTokens > maxTokens) {
      break;
    }

    lines.push(line);
    tokenBudget += lineTokens;
  }

  return {
    items,
    contextBlock:
      lines.length > 0
        ? `Relevant memory:\n${lines.join("\n")}`
        : ""
  };
}
