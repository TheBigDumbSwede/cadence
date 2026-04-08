import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import type {
  MemoryIngestRequest,
  MemoryIngestResult,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryScope,
  MemoryStoredItem,
  MemoryStoredSession
} from "../src/shared/memory-control";
import { MemoryStore } from "./MemoryStore";
import { buildRecallResult, extractMemoryCandidates } from "./memoryPolicy";

const PORT = Number(process.env.CADENCE_MEMORY_PORT ?? "8787");
const STORE_PATH = process.env.CADENCE_MEMORY_STORE_PATH
  ? path.resolve(process.env.CADENCE_MEMORY_STORE_PATH)
  : path.resolve(process.cwd(), "tmp", "memory-sidecar-store.json");

const store = new MemoryStore(STORE_PATH);

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function sendEmpty(response: ServerResponse, statusCode: number): void {
  response.writeHead(statusCode);
  response.end();
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(body) as T;
}

function isMemoryScope(value: unknown): value is MemoryScope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.profileId === "string" &&
    typeof candidate.conversationId === "string" &&
    typeof candidate.backend === "string"
  );
}

function isRecallRequest(value: unknown): value is MemoryRecallRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return isMemoryScope(candidate.scope) && Array.isArray(candidate.recentTurns);
}

function isIngestRequest(value: unknown): value is MemoryIngestRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isMemoryScope(candidate.scope) &&
    Array.isArray(candidate.turns) &&
    typeof candidate.reason === "string"
  );
}

async function handleRecall(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson<MemoryRecallRequest>(request);
  if (!isRecallRequest(body)) {
    sendJson(response, 400, {
      error: "Invalid memory recall request."
    });
    return;
  }

  store.upsertSession(body.scope, body.recentTurns);
  const memories = store.getMemories(body.scope.profileId);
  const result: MemoryRecallResult = buildRecallResult(body, memories);
  sendJson(response, 200, result);
}

async function handleListMemories(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/v1/memories", "http://127.0.0.1");
  const profileId = url.searchParams.get("profileId")?.trim() || "default";
  const items: MemoryStoredItem[] = store
    .getMemories(profileId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((memory) => ({
      id: memory.id,
      type: memory.type,
      text: memory.text,
      keywords: memory.keywords,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      sourceCount: memory.sourceCount
    }));

  sendJson(response, 200, items);
}

async function handleListSessions(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/v1/memory-sessions", "http://127.0.0.1");
  const profileId = url.searchParams.get("profileId")?.trim() || "default";
  const items: MemoryStoredSession[] = store
    .getSessions(profileId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((session) => ({
      conversationId: session.conversationId,
      backend: session.backend,
      participantIds: session.participantIds,
      recentTurns: session.recentTurns,
      updatedAt: session.updatedAt
    }));

  sendJson(response, 200, items);
}

async function handleIngest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson<MemoryIngestRequest>(request);
  if (!isIngestRequest(body)) {
    sendJson(response, 400, {
      error: "Invalid memory ingest request."
    });
    return;
  }

  store.upsertSession(body.scope, body.turns);
  const candidates = extractMemoryCandidates(body.turns);
  const upsertResult = store.upsertMemories(
    candidates.map((candidate) => ({
      profileId: body.scope.profileId,
      conversationId: body.scope.conversationId,
      participantIds: [...(body.scope.participantIds ?? [])],
      type: candidate.type,
      text: candidate.text,
      keywords: candidate.keywords
    }))
  );

  const result: MemoryIngestResult = {
    written: upsertResult.written,
    updated: upsertResult.updated,
    ignored: Math.max(0, candidates.length - upsertResult.written - upsertResult.updated)
  };

  sendJson(response, 200, result);
}

async function handleCloseSession(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await readJson<{ scope?: MemoryScope }>(request);
  if (!isMemoryScope(body.scope)) {
    sendJson(response, 400, {
      error: "Invalid memory session close request."
    });
    return;
  }

  store.closeSession(body.scope);

  sendEmpty(response, 204);
}

async function handleDeleteMemories(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await readJson<{ ids?: string[]; profileId?: string }>(request);
  const profileId = body.profileId?.trim() || "default";
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];

  if (ids.length === 0) {
    sendJson(response, 400, {
      error: "At least one memory id is required."
    });
    return;
  }

  sendJson(response, 200, {
    deleted: store.deleteMemories(profileId, ids)
  });
}

async function handleDeleteAllMemories(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await readJson<{ profileId?: string }>(request);
  const profileId = body.profileId?.trim() || "default";
  sendJson(response, 200, {
    deleted: store.clearMemories(profileId)
  });
}

async function handleDeleteSessions(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await readJson<{ conversationIds?: string[]; profileId?: string }>(request);
  const profileId = body.profileId?.trim() || "default";
  const conversationIds = Array.isArray(body.conversationIds)
    ? body.conversationIds.filter((id) => typeof id === "string")
    : [];

  if (conversationIds.length === 0) {
    sendJson(response, 400, {
      error: "At least one conversation id is required."
    });
    return;
  }

  sendJson(response, 200, {
    deleted: store.deleteSessions(profileId, conversationIds)
  });
}

async function handleDeleteAllSessions(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await readJson<{ profileId?: string }>(request);
  const profileId = body.profileId?.trim() || "default";
  sendJson(response, 200, {
    deleted: store.clearSessions(profileId)
  });
}

const server = createServer((request, response) => {
  void (async () => {
    try {
      const method = request.method ?? "GET";
      const url = request.url ?? "/";

      if (method === "GET" && url === "/v1/health") {
        sendJson(response, 200, {
          ok: true,
          storePath: STORE_PATH
        });
        return;
      }

      if (method === "GET" && url.startsWith("/v1/memories")) {
        await handleListMemories(request, response);
        return;
      }

      if (method === "GET" && url.startsWith("/v1/memory-sessions")) {
        await handleListSessions(request, response);
        return;
      }

      if (method === "POST" && url === "/v1/memory/recall") {
        await handleRecall(request, response);
        return;
      }

      if (method === "POST" && url === "/v1/memory/ingest") {
        await handleIngest(request, response);
        return;
      }

      if (method === "POST" && url === "/v1/memory/session/close") {
        await handleCloseSession(request, response);
        return;
      }

      if (method === "POST" && url === "/v1/memories/delete") {
        await handleDeleteMemories(request, response);
        return;
      }

      if (method === "POST" && url === "/v1/memories/delete-all") {
        await handleDeleteAllMemories(request, response);
        return;
      }

      if (method === "POST" && url === "/v1/memory-sessions/delete") {
        await handleDeleteSessions(request, response);
        return;
      }

      if (method === "POST" && url === "/v1/memory-sessions/delete-all") {
        await handleDeleteAllSessions(request, response);
        return;
      }

      sendJson(response, 404, {
        error: "Not found."
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unhandled memory sidecar error."
      });
    }
  })();
});

server.listen(PORT, "127.0.0.1", () => {
  // Keep startup output terse; this is a local sidecar, not a product.
  console.log(`Cadence memory sidecar listening on http://127.0.0.1:${PORT}`);
  console.log(`Store: ${STORE_PATH}`);
});
