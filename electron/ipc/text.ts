import { ipcMain } from "electron";
import { OpenAIResponsesClient } from "../services/OpenAIResponsesClient";

export function registerTextIpc(): void {
  const client = new OpenAIResponsesClient();

  ipcMain.handle("text:get-state", () => client.getState());

  ipcMain.handle(
    "text:create-response",
    async (
      _event,
      input: string,
      options?: { instructions?: string; model?: string }
    ) => client.createResponse(input, options)
  );
}
