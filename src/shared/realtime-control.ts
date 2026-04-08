import type { CadenceEvent } from "./voice-events";

export type RealtimeControlState = {
  connected: boolean;
  configured: boolean;
  apiKeyPresent: boolean;
  model: string | null;
};

export type RealtimeSessionConfig = {
  model: string;
  voice: string;
  instructions: string;
  modalities: Array<"text" | "audio">;
};

export type RealtimeBridge = {
  connect: (config?: RealtimeSessionConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  sendUserText: (text: string) => Promise<void>;
  sendUserAudio: (audio: ArrayBuffer) => Promise<void>;
  interruptAssistant: (reason?: "user_barge_in" | "operator_stop") => Promise<void>;
  getState: () => Promise<RealtimeControlState>;
  onEvent: (listener: (event: CadenceEvent) => void) => () => void;
};
