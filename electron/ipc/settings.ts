import { ipcMain } from "electron";
import type { SettingsUpdate } from "../../src/shared/app-settings";
import { getSettingsService } from "../services/SettingsService";

export function registerSettingsIpc(onSettingsChanged?: () => void | Promise<void>): void {
  const settings = getSettingsService();

  ipcMain.handle("settings:get", () => settings.getSnapshot());
  ipcMain.handle("settings:update", async (_event, update: SettingsUpdate) => {
    const snapshot = settings.update(update);
    await onSettingsChanged?.();
    return snapshot;
  });
}
