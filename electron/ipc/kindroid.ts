import { ipcMain } from "electron";
import { OfficialKindroidClient } from "../services/kindroid/official/OfficialKindroidClient";

export function registerKindroidIpc(): void {
  const client = new OfficialKindroidClient();

  ipcMain.handle("kindroid:get-state", () => client.getState());
  ipcMain.handle("kindroid:create-response", async (_event, input: string) =>
    client.createResponse(input)
  );
  ipcMain.handle("kindroid:chat-break", async (_event, greeting: string) =>
    client.chatBreak(greeting)
  );
}
