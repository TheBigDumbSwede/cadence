import type { SettingsSnapshot, SettingsUpdate } from "./app-settings";

export type SettingsBridge = {
  get: () => Promise<SettingsSnapshot>;
  update: (update: SettingsUpdate) => Promise<SettingsSnapshot>;
};
