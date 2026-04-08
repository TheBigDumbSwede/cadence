import { ipcMain } from "electron";
import { ExperimentalKindroidClient } from "../services/kindroid/experimental/ExperimentalKindroidClient";

export function registerKindroidExperimentalIpc(): void {
  const client = new ExperimentalKindroidClient();

  ipcMain.handle("kindroid-experimental:get-state", () => client.getState());
  ipcMain.handle("kindroid-experimental:account:check-subscription", () =>
    client.checkSubscription()
  );
  ipcMain.handle("kindroid-experimental:profile:update-user-profile", async (_event, options) =>
    client.updateUserProfile(options)
  );
  ipcMain.handle("kindroid-experimental:kin:create", async (_event, options) =>
    client.createKin(options)
  );
  ipcMain.handle("kindroid-experimental:kin:update", async (_event, options) =>
    client.updateKin(options)
  );
  ipcMain.handle("kindroid-experimental:kin:create-journal-entry", async (_event, options) =>
    client.createJournalEntry(options)
  );
  ipcMain.handle("kindroid-experimental:media:request-selfie", async (_event, options) =>
    client.requestSelfie(options)
  );
  ipcMain.handle("kindroid-experimental:media:request-group-selfie", async (_event, options) =>
    client.requestGroupSelfie(options)
  );
  ipcMain.handle("kindroid-experimental:group-chats:create", async (_event, options) =>
    client.createGroupChat(options)
  );
  ipcMain.handle("kindroid-experimental:group-chats:update", async (_event, options) =>
    client.updateGroupChat(options)
  );
  ipcMain.handle("kindroid-experimental:group-chats:send-message", async (_event, options) =>
    client.sendGroupChatMessage(options)
  );
  ipcMain.handle("kindroid-experimental:group-chats:get-turn", async (_event, options) =>
    client.groupChatGetTurn(options)
  );
  ipcMain.handle("kindroid-experimental:group-chats:ai-response", async (_event, options) =>
    client.groupChatAiResponse(options)
  );
  ipcMain.handle("kindroid-experimental:suggestions:user-message", async (_event, options) =>
    client.suggestUserMessage(options)
  );
  ipcMain.handle(
    "kindroid-experimental:suggestions:user-group-message",
    async (_event, options) => client.suggestUserGroupMessage(options)
  );
}
