import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import type {
  MemoryIngestRequest,
  MemoryIngestResult,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryScope
} from "../src/shared/memory-control";
import { MemoryStore } from "./MemoryStore";
import {
  buildRecallResult,
  buildSessionSummary,
  extractMemoryCandidates
} from "./memoryPolicy";

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

  const session = store.closeSession(body.scope);
  if (session) {
    const summary = buildSessionSummary(session);
    if (summary) {
      store.upsertMemories([
        {
          profileId: session.profileId,
          conversationId: session.conversationId,
          participantIds: session.participantIds,
          type: summary.type,
          text: summary.text,
          keywords: summary.keywords
        }
      ]);
    }
  }

  sendEmpty(response, 204);
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
