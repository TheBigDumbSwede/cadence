import { ipcMain } from "electron";
import type { SettingsUpdate } from "../../src/shared/app-settings";
import { getSettingsService } from "../services/SettingsService";

export function registerSettingsIpc(): void {
  const settings = getSettingsService();

  ipcMain.handle("settings:get", () => settings.getSnapshot());
  ipcMain.handle("settings:update", (_event, update: SettingsUpdate) =>
    settings.update(update)
  );
}
