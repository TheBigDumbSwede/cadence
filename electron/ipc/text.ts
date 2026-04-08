import { ipcMain } from "electron";
import type { TextResponseOptions } from "../../src/shared/text-control";
import { OpenAIResponsesClient } from "../services/OpenAIResponsesClient";

export function registerTextIpc(): void {
  const client = new OpenAIResponsesClient();

  ipcMain.handle("text:get-state", () => client.getState());

  ipcMain.handle(
    "text:create-response",
    async (_event, input: string, options?: TextResponseOptions) =>
      client.createResponse(input, options)
  );
}
