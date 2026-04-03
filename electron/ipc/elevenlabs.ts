import { ipcMain } from "electron";
import { ElevenLabsClient } from "../services/ElevenLabsClient";

export function registerElevenLabsIpc(): void {
  const client = new ElevenLabsClient();

  ipcMain.handle("elevenlabs:get-state", () => client.getState());
  ipcMain.handle(
    "elevenlabs:synthesize",
    async (_event, text: string, options?: { voiceId?: string }) =>
      client.synthesize(text, options)
  );
}
