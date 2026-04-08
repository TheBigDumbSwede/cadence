import type {
  MemoryItem,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryScope,
  MemoryTurn
} from "../src/shared/memory-control";
import type { StoredMemory } from "./MemoryStore";

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

function cleanDetail(value: string): string {
  return normalizeText(value).replace(/[.?!]+$/, "");
}

function extractPreference(text: string): MemoryCandidate | null {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();

  const preferMatch = normalized.match(/^i prefer (.+)$/i);
  if (preferMatch) {
    const detail = cleanDetail(preferMatch[1]);
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
    const detail = cleanDetail(styleMatch[1]);
    return {
      type: "preference",
      text: `User prefers replies that are ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const likesMatch = normalized.match(/^i (like|love|enjoy) (.+)$/i);
  if (likesMatch) {
    const detail = cleanDetail(likesMatch[2]);
    return {
      type: "preference",
      text: `User likes ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const dislikeMatch = normalized.match(/^i (?:do not like|don't like|dislike|hate) (.+)$/i);
  if (dislikeMatch) {
    const detail = cleanDetail(dislikeMatch[1]);
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
    const detail = cleanDetail(callMeMatch[1]);
    return {
      type: "fact",
      text: `User prefers to be called ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const usingMatch = normalized.match(/^i(?:'m| am)? using (.+)$/i);
  if (usingMatch) {
    const detail = cleanDetail(usingMatch[1]);
    return {
      type: "fact",
      text: `User is using ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const useMatch = normalized.match(/^i use (.+)$/i);
  if (useMatch) {
    const detail = cleanDetail(useMatch[1]);
    return {
      type: "fact",
      text: `User uses ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const liveMatch = normalized.match(/^i live in (.+)$/i);
  if (liveMatch) {
    const detail = cleanDetail(liveMatch[1]);
    return {
      type: "fact",
      text: `User lives in ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  return null;
}

function extractProjectContext(text: string): MemoryCandidate | null {
  const normalized = normalizeText(text);

  const projectMatch = normalized.match(
    /^(?:i(?:'m| am)?|we(?:'re| are)?) (?:working on|building|making|writing|testing|debugging) (.+)$/i
  );
  if (projectMatch) {
    const detail = cleanDetail(projectMatch[1]);
    return {
      type: "project",
      text: `Current project context: ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const decisionMatch = normalized.match(/^(?:we decided to|the plan is to) (.+)$/i);
  if (decisionMatch) {
    const detail = cleanDetail(decisionMatch[1]);
    return {
      type: "project",
      text: `Project decision: ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  return null;
}

function extractOpenThread(text: string): MemoryCandidate | null {
  const normalized = normalizeText(text);

  const needMatch = normalized.match(/^(?:i need to|we need to|next step is to|the next step is to) (.+)$/i);
  if (needMatch) {
    const detail = cleanDetail(needMatch[1]);
    return {
      type: "thread",
      text: `Open thread: ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const issueMatch = normalized.match(/^(?:the issue is|the problem is|i(?:'m| am) stuck on) (.+)$/i);
  if (issueMatch) {
    const detail = cleanDetail(issueMatch[1]);
    return {
      type: "thread",
      text: `Open issue: ${detail}.`,
      keywords: tokenize(detail)
    };
  }

  const continueMatch = normalized.match(/^(?:let'?s continue with|we were talking about|remind me about) (.+)$/i);
  if (continueMatch) {
    const detail = cleanDetail(continueMatch[1]);
    return {
      type: "thread",
      text: `Resume thread: ${detail}.`,
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

    const project = extractProjectContext(turn.text);
    if (project) {
      candidates.push(project);
    }

    const thread = extractOpenThread(turn.text);
    if (thread) {
      candidates.push(thread);
    }
  }

  return Array.from(
    new Map(
      candidates
        .filter((candidate) => candidate.keywords.length > 0)
        .map((candidate) => [`${candidate.type}:${candidate.text.toLowerCase()}`, candidate])
    ).values()
  );
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
  if (memory.type === "project" || memory.type === "thread") {
    score += 0.75;
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
    .filter((memory) => memory.type !== "session")
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
