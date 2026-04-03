import type { InteractionMode } from "./interaction-mode";

export type BackendConfigSummary = {
  mode: InteractionMode;
  providerLabel: string;
  configured: boolean;
  items: Array<{
    label: string;
    present: boolean;
    value?: string;
  }>;
};
