import { app, ipcMain } from "electron";
import type { RuntimeInfo } from "../../src/shared/runtime-info";
import { getSettingsService } from "../services/SettingsService";

export function registerAppIpc(): void {
  ipcMain.handle("app:get-runtime-info", () => {
    const settings = getSettingsService();
    const runtimeInfo: RuntimeInfo = {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? "unknown",
      chromeVersion: process.versions.chrome ?? "unknown",
      hasOpenAiKey: Boolean(settings.getOpenAiApiKey()),
      nodeVersion: process.versions.node,
      platform: process.platform
    };

    return runtimeInfo;
  });
}
