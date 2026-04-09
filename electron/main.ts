import "dotenv/config";

import { app, BrowserWindow } from "electron";
import path from "node:path";
import { registerAppIpc } from "./ipc/app";
import { registerElevenLabsIpc } from "./ipc/elevenlabs";
import { registerKindroidExperimentalIpc } from "./ipc/kindroid-experimental";
import { registerKindroidIpc } from "./ipc/kindroid";
import { registerMemoryIpc } from "./ipc/memory";
import { registerOpenAiAudioIpc } from "./ipc/openai-audio";
import { registerOpenAiSpeechIpc } from "./ipc/openai-speech";
import { registerRealtimeIpc } from "./ipc/realtime";
import { registerSettingsIpc } from "./ipc/settings";
import { registerTextIpc } from "./ipc/text";
import { MemorySidecarManager } from "./services/MemorySidecarManager";

const DEFAULT_WINDOW = {
  width: 1420,
  height: 920,
  minWidth: 1100,
  minHeight: 720
};

let mainWindow: BrowserWindow | null = null;
const memorySidecarManager = new MemorySidecarManager();

function getRendererEntryPoint(): string {
  if (process.env.CADENCE_RENDERER_URL) {
    return process.env.CADENCE_RENDERER_URL;
  }

  return path.join(__dirname, "../dist/index.html");
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...DEFAULT_WINDOW,
    title: "Cadence",
    show: false,
    backgroundColor: "#14110f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const entryPoint = getRendererEntryPoint();

  if (entryPoint.startsWith("http")) {
    void window.loadURL(entryPoint);
  } else {
    void window.loadFile(entryPoint);
  }

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    mainWindow = null;
  });

  return window;
}

void app.whenReady().then(() => {
  registerAppIpc();
  registerElevenLabsIpc();
  registerKindroidExperimentalIpc();
  registerKindroidIpc();
  registerMemoryIpc(memorySidecarManager);
  registerOpenAiAudioIpc();
  registerOpenAiSpeechIpc();
  registerRealtimeIpc(() => mainWindow);
  registerSettingsIpc(() => memorySidecarManager.syncWithSettings());
  registerTextIpc();
  void memorySidecarManager.syncWithSettings();
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  memorySidecarManager.stopManagedSidecar();
});
