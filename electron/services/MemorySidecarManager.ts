import { app } from "electron";
import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getSettingsService } from "./SettingsService";

function isLocalMemoryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1")
    );
  } catch {
    return false;
  }
}

function resolveSidecarEntryPoint(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "dist-sidecar", "main.js");
  }

  return path.resolve(__dirname, "../dist-sidecar/main.js");
}

function resolveStorePath(): string {
  return path.join(app.getPath("userData"), "memory-sidecar-store.json");
}

async function isHealthy(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/health`, {
      method: "GET",
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export class MemorySidecarManager {
  private child: ChildProcess | null = null;
  private childBaseUrl: string | null = null;
  private mode: "disabled" | "external" | "local-external" | "local-managed" = "disabled";

  async syncWithSettings(): Promise<void> {
    const baseUrl = getSettingsService().getMemoryBaseUrl().trim();

    if (!baseUrl || !isLocalMemoryUrl(baseUrl)) {
      this.stopManagedSidecar();
      this.mode = baseUrl ? "external" : "disabled";
      return;
    }

    if (await isHealthy(baseUrl)) {
      this.stopManagedSidecar();
      this.mode = "local-external";
      return;
    }

    if (this.child && this.child.exitCode === null && this.childBaseUrl === baseUrl) {
      this.mode = "local-managed";
      return;
    }

    this.stopManagedSidecar();
    this.startManagedSidecar(baseUrl);
  }

  getState(): {
    mode: "disabled" | "external" | "local-external" | "local-managed";
    childRunning: boolean;
    storePath: string | null;
  } {
    const localMode = this.mode === "local-external" || this.mode === "local-managed";
    return {
      mode: this.mode,
      childRunning: Boolean(this.child && this.child.exitCode === null),
      storePath: localMode ? resolveStorePath() : null
    };
  }

  stopManagedSidecar(): void {
    if (!this.child || this.child.exitCode !== null) {
      this.child = null;
      this.childBaseUrl = null;
      return;
    }

    this.child.kill();
    this.child = null;
    this.childBaseUrl = null;
  }

  private startManagedSidecar(baseUrl: string): void {
    const entryPoint = resolveSidecarEntryPoint();
    if (!existsSync(entryPoint)) {
      this.mode = "local-managed";
      console.warn(`[memory-sidecar] entry point not found: ${entryPoint}`);
      return;
    }

    const url = new URL(baseUrl);
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    const child = fork(entryPoint, {
      env: {
        ...process.env,
        CADENCE_MEMORY_PORT: String(port),
        CADENCE_MEMORY_STORE_PATH: resolveStorePath()
      },
      stdio: "ignore"
    });

    child.once("exit", () => {
      if (this.child === child) {
        this.child = null;
        this.childBaseUrl = null;
      }
    });

    this.child = child;
    this.childBaseUrl = baseUrl;
    this.mode = "local-managed";
  }
}
