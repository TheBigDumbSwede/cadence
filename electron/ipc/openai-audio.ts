import { ipcMain } from "electron";
import { OpenAIAudioClient } from "../services/OpenAIAudioClient";

export function registerOpenAiAudioIpc(): void {
  const client = new OpenAIAudioClient();

  ipcMain.handle("openai-audio:get-state", () => client.getState());
  ipcMain.handle("openai-audio:transcribe", async (_event, audio: ArrayBuffer) =>
    client.transcribe(audio)
  );
}
