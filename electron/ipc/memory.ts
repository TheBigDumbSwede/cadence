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
  ipcMain.handle("memory:recall", (_event, request: MemoryRecallRequest) =>
    client.recall(request)
  );
  ipcMain.handle("memory:ingest", (_event, request: MemoryIngestRequest) =>
    client.ingest(request)
  );
  ipcMain.handle("memory:close-session", (_event, scope: MemoryScope) =>
    client.closeSession(scope)
  );
}
