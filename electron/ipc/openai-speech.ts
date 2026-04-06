import { ipcMain } from "electron";
import { OpenAISpeechClient } from "../services/OpenAISpeechClient";

export function registerOpenAiSpeechIpc(): void {
  const client = new OpenAISpeechClient();

  ipcMain.handle("openai-speech:get-state", () => client.getState());
  ipcMain.handle(
    "openai-speech:synthesize",
    async (_event, text: string, options?: { voice?: string; instructions?: string }) =>
      client.synthesize(text, options)
  );
}
