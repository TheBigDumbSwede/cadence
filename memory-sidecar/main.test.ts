import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type {
  MemoryIngestRequest,
  MemoryRecallRequest,
  MemoryStoredItem,
  MemoryStoredSession
} from "../src/shared/memory-control";
import { createMemorySidecarServer } from "./main";

type StartedServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

async function startServer(storePath: string): Promise<StartedServer> {
  const { server } = createMemorySidecarServer({ storePath });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve memory sidecar test address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server)
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function postJson<T>(baseUrl: string, pathname: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${pathname}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function getJson<T>(baseUrl: string, pathname: string): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${pathname}`);
  }

  return (await response.json()) as T;
}

describe("memory sidecar HTTP surface", () => {
  let tempDir = "";
  let storePath = "";
  let server: StartedServer | null = null;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "cadence-memory-sidecar-test-"));
    storePath = path.join(tempDir, "memory-store.json");
    server = await startServer(storePath);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("ingests memories, lists them, and recalls a compact context block", async () => {
    const ingestRequest: MemoryIngestRequest = {
      scope: {
        profileId: "default",
        conversationId: "conv-1",
        backend: "openai-responses"
      },
      turns: [
        { role: "user", text: "Please keep replies concise." },
        { role: "user", text: "I use a Shure MV7." }
      ],
      reason: "turn"
    };

    const ingestResult = await postJson<{ written: number; updated: number; ignored: number }>(
      server!.baseUrl,
      "/v1/memory/ingest",
      ingestRequest
    );

    expect(ingestResult).toEqual({
      written: 2,
      updated: 0,
      ignored: 0
    });

    const memories = await getJson<MemoryStoredItem[]>(server!.baseUrl, "/v1/memories");
    expect(memories).toHaveLength(2);
    expect(memories.map((memory) => memory.text)).toEqual(
      expect.arrayContaining([
        "User prefers replies that are concise.",
        "User uses a Shure MV7."
      ])
    );

    const recallRequest: MemoryRecallRequest = {
      scope: {
        profileId: "default",
        conversationId: "conv-1",
        backend: "openai-responses"
      },
      recentTurns: [{ role: "user", text: "What mic am I using? Please answer briefly." }],
      maxItems: 6,
      maxTokens: 100
    };

    const recallResult = await postJson<{
      items: Array<{ text: string }>;
      contextBlock: string;
    }>(server!.baseUrl, "/v1/memory/recall", recallRequest);

    expect(recallResult.items.map((item) => item.text)).toEqual(
      expect.arrayContaining([
        "User prefers replies that are concise.",
        "User uses a Shure MV7."
      ])
    );
    expect(recallResult.contextBlock).toContain("Relevant memory:");
    expect(recallResult.contextBlock).toContain("User uses a Shure MV7.");
  });

  it("closes sessions without removing durable memories", async () => {
    const ingestRequest: MemoryIngestRequest = {
      scope: {
        profileId: "default",
        conversationId: "conv-2",
        backend: "openai-realtime"
      },
      turns: [{ role: "user", text: "I prefer short answers." }],
      reason: "checkpoint"
    };

    await postJson(server!.baseUrl, "/v1/memory/ingest", ingestRequest);

    let sessions = await getJson<MemoryStoredSession[]>(server!.baseUrl, "/v1/memory-sessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].conversationId).toBe("conv-2");

    await postJson(server!.baseUrl, "/v1/memory/session/close", {
      scope: ingestRequest.scope
    });

    sessions = await getJson<MemoryStoredSession[]>(server!.baseUrl, "/v1/memory-sessions");
    expect(sessions).toEqual([]);

    const memories = await getJson<MemoryStoredItem[]>(server!.baseUrl, "/v1/memories");
    expect(memories).toHaveLength(1);
    expect(memories[0].text).toBe("User prefers short answers.");
  });

  it("deletes selected memories and clears session state independently", async () => {
    await postJson(server!.baseUrl, "/v1/memory/ingest", {
      scope: {
        profileId: "default",
        conversationId: "conv-3",
        backend: "openai-responses"
      },
      turns: [
        { role: "user", text: "I use a Shure MV7." },
        { role: "user", text: "The issue is that dev doesn't start the sidecar." }
      ],
      reason: "turn"
    } satisfies MemoryIngestRequest);

    let memories = await getJson<MemoryStoredItem[]>(server!.baseUrl, "/v1/memories");
    expect(memories).toHaveLength(2);

    const deletedMemory = await postJson<{ deleted: number }>(
      server!.baseUrl,
      "/v1/memories/delete",
      {
        ids: [memories[0].id]
      }
    );
    expect(deletedMemory.deleted).toBe(1);

    memories = await getJson<MemoryStoredItem[]>(server!.baseUrl, "/v1/memories");
    expect(memories).toHaveLength(1);

    const deletedSessions = await postJson<{ deleted: number }>(
      server!.baseUrl,
      "/v1/memory-sessions/delete-all",
      {
        profileId: "default"
      }
    );
    expect(deletedSessions.deleted).toBe(1);

    const sessions = await getJson<MemoryStoredSession[]>(
      server!.baseUrl,
      "/v1/memory-sessions"
    );
    expect(sessions).toEqual([]);

    const deletedAllMemories = await postJson<{ deleted: number }>(
      server!.baseUrl,
      "/v1/memories/delete-all",
      {
        profileId: "default"
      }
    );
    expect(deletedAllMemories.deleted).toBe(1);
    expect(await getJson<MemoryStoredItem[]>(server!.baseUrl, "/v1/memories")).toEqual([]);
  });
});
