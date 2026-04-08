import { ipcMain } from "electron";
import type {
  MemoryIngestRequest,
  MemoryRecallRequest,
  MemoryScope
} from "../../src/shared/memory-control";
import { MemoryClient } from "../services/MemoryClient";

export function registerMemoryIpc(): void {
  const client = new MemoryClient();

  ipcMain.handle("memory:get-state", () => client.getState());
  ipcMain.handle("memory:list", (_event, profileId?: string) => client.list(profileId));
  ipcMain.handle("memory:list-sessions", (_event, profileId?: string) =>
    client.listSessions(profileId)
  );
  ipcMain.handle("memory:recall", (_event, request: MemoryRecallRequest) =>
    client.recall(request)
  );
  ipcMain.handle("memory:ingest", (_event, request: MemoryIngestRequest) =>
    client.ingest(request)
  );
  ipcMain.handle("memory:close-session", (_event, scope: MemoryScope) =>
    client.closeSession(scope)
  );
  ipcMain.handle("memory:delete-many", (_event, ids: string[], profileId?: string) =>
    client.deleteMany(ids, profileId)
  );
  ipcMain.handle("memory:delete-all", (_event, profileId?: string) =>
    client.deleteAll(profileId)
  );
  ipcMain.handle(
    "memory:delete-sessions",
    (_event, conversationIds: string[], profileId?: string) =>
      client.deleteSessions(conversationIds, profileId)
  );
  ipcMain.handle("memory:delete-all-sessions", (_event, profileId?: string) =>
    client.deleteAllSessions(profileId)
  );
}
