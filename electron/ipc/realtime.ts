import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { OpenAIRealtimeSocket } from "../services/OpenAIRealtimeSocket";

export function registerRealtimeIpc(getWindow: () => BrowserWindow | null): void {
  const realtime = new OpenAIRealtimeSocket(getWindow);

  ipcMain.handle("realtime:connect", async () => {
    await realtime.connect();
  });

  ipcMain.handle("realtime:disconnect", async () => {
    await realtime.disconnect();
  });

  ipcMain.handle("realtime:send-user-text", async (_event, text: string) => {
    await realtime.sendUserText(text);
  });

  ipcMain.handle(
    "realtime:send-user-audio",
    async (_event, audio: ArrayBuffer) => {
      await realtime.sendUserAudio(audio);
    }
  );

  ipcMain.handle(
    "realtime:interrupt-assistant",
    async (_event, reason?: "user_barge_in" | "operator_stop") => {
      await realtime.interruptAssistant(reason);
    }
  );

  ipcMain.handle("realtime:get-state", () => realtime.getState());
}
