import { app, ipcMain } from "electron";
import type { RuntimeInfo } from "../../src/shared/runtime-info";

export function registerAppIpc(): void {
  ipcMain.handle("app:get-runtime-info", () => {
    const runtimeInfo: RuntimeInfo = {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? "unknown",
      chromeVersion: process.versions.chrome ?? "unknown",
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      nodeVersion: process.versions.node,
      platform: process.platform
    };

    return runtimeInfo;
  });
}
