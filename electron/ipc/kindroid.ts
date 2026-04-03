import { ipcMain } from "electron";
import { KindroidClient } from "../services/KindroidClient";

export function registerKindroidIpc(): void {
  const client = new KindroidClient();

  ipcMain.handle("kindroid:get-state", () => client.getState());
  ipcMain.handle(
    "kindroid:create-response",
    async (_event, input: string) => client.createResponse(input)
  );
  ipcMain.handle("kindroid:chat-break", async (_event, greeting: string) =>
    client.chatBreak(greeting)
  );
}
