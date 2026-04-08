import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MemoryItem, MemoryScope, MemoryTurn } from "../src/shared/memory-control";

export type StoredMemory = MemoryItem & {
  profileId: string;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
  lastConversationId: string;
  participantIds: string[];
  sourceCount: number;
};

export type StoredSession = {
  profileId: string;
  conversationId: string;
  backend: MemoryScope["backend"];
  participantIds: string[];
  recentTurns: MemoryTurn[];
  updatedAt: string;
};

type StoreFile = {
  memories: StoredMemory[];
  sessions: StoredSession[];
};

type UpsertMemoryInput = {
  profileId: string;
  conversationId: string;
  participantIds: string[];
  type: MemoryItem["type"];
  text: string;
  keywords: string[];
};

function createEmptyStore(): StoreFile {
  return {
    memories: [],
    sessions: []
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function canonicalKey(type: MemoryItem["type"], text: string): string {
  return `${type}::${normalizeText(text).toLowerCase()}`;
}

export class MemoryStore {
  private cache: StoreFile | null = null;

  constructor(private readonly storePath: string) {}

  getMemories(profileId: string): StoredMemory[] {
    return this.readStore().memories.filter((memory) => memory.profileId === profileId);
  }

  getSessions(profileId: string): StoredSession[] {
    return this.readStore().sessions.filter((session) => session.profileId === profileId);
  }

  deleteMemories(profileId: string, ids: string[]): number {
    if (ids.length === 0) {
      return 0;
    }

    const store = this.readStore();
    const before = store.memories.length;
    const idSet = new Set(ids);
    store.memories = store.memories.filter(
      (memory) => memory.profileId !== profileId || !idSet.has(memory.id)
    );
    const deleted = before - store.memories.length;
    if (deleted > 0) {
      this.writeStore(store);
    }

    return deleted;
  }

  clearMemories(profileId: string): number {
    const store = this.readStore();
    const before = store.memories.length;
    store.memories = store.memories.filter((memory) => memory.profileId !== profileId);
    const deleted = before - store.memories.length;
    if (deleted > 0) {
      this.writeStore(store);
    }

    return deleted;
  }

  deleteSessions(profileId: string, conversationIds: string[]): number {
    if (conversationIds.length === 0) {
      return 0;
    }

    const store = this.readStore();
    const before = store.sessions.length;
    const conversationIdSet = new Set(conversationIds);
    store.sessions = store.sessions.filter(
      (session) =>
        session.profileId !== profileId || !conversationIdSet.has(session.conversationId)
    );
    const deleted = before - store.sessions.length;
    if (deleted > 0) {
      this.writeStore(store);
    }

    return deleted;
  }

  clearSessions(profileId: string): number {
    const store = this.readStore();
    const before = store.sessions.length;
    store.sessions = store.sessions.filter((session) => session.profileId !== profileId);
    const deleted = before - store.sessions.length;
    if (deleted > 0) {
      this.writeStore(store);
    }

    return deleted;
  }

  getSession(scope: MemoryScope): StoredSession | null {
    return (
      this.readStore().sessions.find(
        (session) =>
          session.profileId === scope.profileId &&
          session.conversationId === scope.conversationId
      ) ?? null
    );
  }

  upsertSession(scope: MemoryScope, turns: MemoryTurn[]): StoredSession {
    const store = this.readStore();
    const now = new Date().toISOString();
    const participantIds = [...(scope.participantIds ?? [])];
    const nextSession: StoredSession = {
      profileId: scope.profileId,
      conversationId: scope.conversationId,
      backend: scope.backend,
      participantIds,
      recentTurns: turns.slice(-12),
      updatedAt: now
    };

    const existingIndex = store.sessions.findIndex(
      (session) =>
        session.profileId === scope.profileId && session.conversationId === scope.conversationId
    );

    if (existingIndex >= 0) {
      store.sessions[existingIndex] = nextSession;
    } else {
      store.sessions.push(nextSession);
    }

    this.writeStore(store);
    return nextSession;
  }

  closeSession(scope: MemoryScope): StoredSession | null {
    const store = this.readStore();
    const sessionIndex = store.sessions.findIndex(
      (session) =>
        session.profileId === scope.profileId && session.conversationId === scope.conversationId
    );

    if (sessionIndex < 0) {
      return null;
    }

    const [session] = store.sessions.splice(sessionIndex, 1);
    this.writeStore(store);
    return session ?? null;
  }

  upsertMemories(items: UpsertMemoryInput[]): { written: number; updated: number } {
    if (items.length === 0) {
      return { written: 0, updated: 0 };
    }

    const store = this.readStore();
    let written = 0;
    let updated = 0;

    for (const item of items) {
      const normalizedText = normalizeText(item.text);
      if (!normalizedText) {
        continue;
      }

      const key = canonicalKey(item.type, normalizedText);
      const existing = store.memories.find(
        (memory) =>
          memory.profileId === item.profileId && canonicalKey(memory.type, memory.text) === key
      );

      if (existing) {
        existing.updatedAt = new Date().toISOString();
        existing.lastConversationId = item.conversationId;
        existing.keywords = item.keywords;
        existing.participantIds = item.participantIds;
        existing.sourceCount += 1;
        updated += 1;
        continue;
      }

      store.memories.push({
        id: randomUUID(),
        type: item.type,
        text: normalizedText,
        keywords: item.keywords,
        profileId: item.profileId,
        participantIds: item.participantIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastConversationId: item.conversationId,
        sourceCount: 1
      });
      written += 1;
    }

    this.writeStore(store);
    return { written, updated };
  }

  private readStore(): StoreFile {
    if (this.cache) {
      return this.cache;
    }

    if (!existsSync(this.storePath)) {
      this.cache = createEmptyStore();
      return this.cache;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.storePath, "utf8")) as Partial<StoreFile>;
      this.cache = {
        memories: Array.isArray(parsed.memories) ? parsed.memories : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
      };
      return this.cache;
    } catch {
      this.cache = createEmptyStore();
      return this.cache;
    }
  }

  private writeStore(store: StoreFile): void {
    mkdirSync(path.dirname(this.storePath), { recursive: true });
    writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
    this.cache = store;
  }
}
