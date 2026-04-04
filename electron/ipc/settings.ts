import { dialog, ipcMain, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SettingsUpdate } from "../../src/shared/app-settings";
import { getSettingsService } from "../services/SettingsService";

export function registerSettingsIpc(): void {
  const settings = getSettingsService();

  ipcMain.handle("settings:get", () => settings.getSnapshot());
  ipcMain.handle("settings:update", (_event, update: SettingsUpdate) =>
    settings.update(update)
  );
  ipcMain.handle("settings:set-avatar", (_event, filePath: string | null) =>
    settings.setAvatar(filePath)
  );
  ipcMain.handle("settings:read-avatar-file", (_event, filePath: string) =>
    settings.readAvatarFile(filePath)
  );
  ipcMain.handle("settings:choose-avatar-file", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(window, {
      title: "Choose VRM Avatar",
      properties: ["openFile"],
      filters: [
        { name: "VRM Avatar", extensions: ["vrm"] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];

    return {
      path: filePath,
      label: path.basename(filePath),
      fileUrl: pathToFileURL(filePath).href
    };
  });
}
