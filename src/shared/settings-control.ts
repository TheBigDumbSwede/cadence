import type { AvatarSelection, SettingsSnapshot, SettingsUpdate } from "./app-settings";

export type SettingsBridge = {
  get: () => Promise<SettingsSnapshot>;
  update: (update: SettingsUpdate) => Promise<SettingsSnapshot>;
  setAvatar: (filePath: string | null) => Promise<SettingsSnapshot>;
  chooseAvatarFile: () => Promise<AvatarSelection | null>;
  readAvatarFile: (filePath: string) => Promise<ArrayBuffer>;
};
