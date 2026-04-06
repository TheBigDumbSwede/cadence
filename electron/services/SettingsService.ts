import "dotenv/config";

import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AvatarSelection,
  SettingsPreferences,
  SettingsSnapshot,
  SettingsUpdate
} from "../../src/shared/app-settings";
import type { KindroidParticipant } from "../../src/shared/kindroid-participants";

type StoredSettings = {
  preferences?: Partial<SettingsPreferences>;
  openAiTtsVoice?: string;
  openAiTtsInstructions?: string;
  elevenLabsVoiceId?: string;
  kindroidAiId?: string;
  kindroidBaseUrl?: string;
  kindroidExperimentalEnabled?: boolean;
  kindroidGreeting?: string;
  kindroidParticipants?: KindroidParticipant[];
  activeKindroidParticipantId?: string;
  avatarPath?: string;
  recentAvatarPaths?: string[];
  secrets?: {
    openAiApiKey?: string;
    elevenLabsApiKey?: string;
    kindroidApiKey?: string;
  };
};

const DEFAULT_PREFERENCES: SettingsPreferences = {
  mode: "voice",
  stageMode: "waveform",
  textBackend: "openai",
  ttsProvider: "elevenlabs",
  voiceInputMode: "push_to_talk",
  voiceBackend: "openai"
};

const DEFAULT_KINDROID_BASE_URL = "https://api.kindroid.ai/v1";
const DEFAULT_KINDROID_GREETING = "Hello.";
const LEGACY_KINDROID_PARTICIPANT_ID = "legacy-kindroid";
const MAX_RECENT_AVATARS = 6;

function normalizeValue(value: string | undefined | null): string {
  return value?.trim() ?? "";
}

function parseBooleanEnv(value: string | null): boolean | null {
  if (!value) {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return null;
  }
}

export class SettingsService {
  private cache: StoredSettings | null = null;

  getSnapshot(): SettingsSnapshot {
    const stored = this.readStore();
    const kindroidParticipants = this.getKindroidParticipants();
    const activeKindroidParticipantId = this.getActiveKindroidParticipantId();

    return {
      preferences: {
        mode: stored.preferences?.mode ?? DEFAULT_PREFERENCES.mode,
        stageMode: stored.preferences?.stageMode ?? DEFAULT_PREFERENCES.stageMode,
        textBackend: stored.preferences?.textBackend ?? DEFAULT_PREFERENCES.textBackend,
        ttsProvider: stored.preferences?.ttsProvider ?? DEFAULT_PREFERENCES.ttsProvider,
        voiceInputMode:
          stored.preferences?.voiceInputMode ?? DEFAULT_PREFERENCES.voiceInputMode,
        voiceBackend: stored.preferences?.voiceBackend ?? DEFAULT_PREFERENCES.voiceBackend
      },
      openAiTtsVoice: this.getOpenAiTtsVoice(),
      openAiTtsInstructions: this.getOpenAiTtsInstructions(),
      elevenLabsVoiceId: this.getElevenLabsVoiceId() ?? "",
      kindroidAiId: this.getKindroidAiId() ?? "",
      kindroidBaseUrl: this.getKindroidBaseUrl(),
      kindroidExperimentalEnabled: this.getKindroidExperimentalEnabled(),
      kindroidGreeting: this.getKindroidGreeting(),
      kindroidParticipants,
      activeKindroidParticipantId,
      avatar: this.getAvatarSelection(),
      recentAvatars: this.getRecentAvatarSelections(),
      hasOpenAiApiKey: Boolean(this.getOpenAiApiKey()),
      hasElevenLabsApiKey: Boolean(this.getElevenLabsApiKey()),
      hasKindroidApiKey: Boolean(this.getKindroidApiKey()),
      secretStorage: safeStorage.isEncryptionAvailable() ? "encrypted" : "plain"
    };
  }

  update(update: SettingsUpdate): SettingsSnapshot {
    const stored = this.readStore();
    const normalizedKindroidParticipants = this.normalizeKindroidParticipants(
      update.kindroidParticipants
    );

    stored.preferences = {
      mode: update.preferences.mode,
      stageMode: update.preferences.stageMode,
      textBackend: update.preferences.textBackend,
      ttsProvider: update.preferences.ttsProvider,
      voiceInputMode: update.preferences.voiceInputMode,
      voiceBackend: update.preferences.voiceBackend
    };
    stored.openAiTtsVoice = normalizeValue(update.openAiTtsVoice);
    stored.openAiTtsInstructions = normalizeValue(update.openAiTtsInstructions);
    stored.elevenLabsVoiceId = normalizeValue(update.elevenLabsVoiceId);
    stored.kindroidAiId = normalizeValue(update.kindroidAiId);
    stored.kindroidBaseUrl = normalizeValue(update.kindroidBaseUrl);
    stored.kindroidExperimentalEnabled = update.kindroidExperimentalEnabled;
    stored.kindroidGreeting = normalizeValue(update.kindroidGreeting);
    stored.kindroidParticipants = normalizedKindroidParticipants;
    stored.activeKindroidParticipantId = this.normalizeKindroidParticipantId(
      update.activeKindroidParticipantId,
      normalizedKindroidParticipants
    );
    if (typeof update.avatarPath === "string") {
      const normalizedPath = normalizeValue(update.avatarPath);
      if (normalizedPath) {
        this.assertAvatarPath(normalizedPath);
        stored.avatarPath = normalizedPath;
        stored.recentAvatarPaths = this.buildRecentAvatarPaths(
          normalizedPath,
          stored.recentAvatarPaths
        );
      } else {
        delete stored.avatarPath;
      }
    } else if (update.clearAvatar) {
      delete stored.avatarPath;
    }
    stored.secrets ??= {};

    if (typeof update.openAiApiKey === "string" && update.openAiApiKey.trim()) {
      stored.secrets.openAiApiKey = this.encodeSecret(update.openAiApiKey.trim());
    } else if (update.clearOpenAiApiKey) {
      delete stored.secrets.openAiApiKey;
    }

    if (typeof update.elevenLabsApiKey === "string" && update.elevenLabsApiKey.trim()) {
      stored.secrets.elevenLabsApiKey = this.encodeSecret(update.elevenLabsApiKey.trim());
    } else if (update.clearElevenLabsApiKey) {
      delete stored.secrets.elevenLabsApiKey;
    }

    if (typeof update.kindroidApiKey === "string" && update.kindroidApiKey.trim()) {
      stored.secrets.kindroidApiKey = this.encodeSecret(update.kindroidApiKey.trim());
    } else if (update.clearKindroidApiKey) {
      delete stored.secrets.kindroidApiKey;
    }

    this.writeStore(stored);
    return this.getSnapshot();
  }

  setAvatar(filePath: string | null): SettingsSnapshot {
    const stored = this.readStore();

    if (filePath) {
      const normalizedPath = normalizeValue(filePath);
      this.assertAvatarPath(normalizedPath);
      stored.avatarPath = normalizedPath;
      stored.recentAvatarPaths = this.buildRecentAvatarPaths(
        normalizedPath,
        stored.recentAvatarPaths
      );
    } else {
      delete stored.avatarPath;
    }

    this.writeStore(stored);
    return this.getSnapshot();
  }

  getOpenAiApiKey(): string | null {
    return this.getResolvedSecret("openAiApiKey", "OPENAI_API_KEY");
  }

  getOpenAiTtsVoice(): string {
    return (
      this.getStoredNonSecret("openAiTtsVoice") ??
      this.getEnv("OPENAI_TTS_VOICE") ??
      "alloy"
    );
  }

  getOpenAiTtsInstructions(): string {
    return this.getStoredNonSecret("openAiTtsInstructions") ?? this.getEnv("OPENAI_TTS_INSTRUCTIONS") ?? "";
  }

  getElevenLabsApiKey(): string | null {
    return this.getResolvedSecret("elevenLabsApiKey", "ELEVENLABS_API_KEY");
  }

  getElevenLabsVoiceId(): string | null {
    return (
      this.getStoredNonSecret("elevenLabsVoiceId") ??
      this.getEnv("ELEVENLABS_VOICE_ID") ??
      this.getEnv("CADENCE_VOICE_ID")
    );
  }

  getKindroidApiKey(): string | null {
    return this.getResolvedSecret("kindroidApiKey", "KINDROID_API_KEY");
  }

  getKindroidAiId(): string | null {
    const activeParticipant = this.getActiveKindroidParticipant();
    if (activeParticipant) {
      return activeParticipant.aiId;
    }

    return this.getStoredNonSecret("kindroidAiId") ?? this.getEnv("KINDROID_AI_ID");
  }

  getKindroidBaseUrl(): string {
    return (
      this.getStoredNonSecret("kindroidBaseUrl") ??
      this.getEnv("KINDROID_BASE_URL") ??
      DEFAULT_KINDROID_BASE_URL
    );
  }

  getKindroidExperimentalEnabled(): boolean {
    const stored = this.readStore().kindroidExperimentalEnabled;
    if (typeof stored === "boolean") {
      return stored;
    }

    return parseBooleanEnv(this.getEnv("KINDROID_EXPERIMENTAL_ENABLED")) ?? false;
  }

  getKindroidGreeting(): string {
    return (
      this.getStoredNonSecret("kindroidGreeting") ??
      this.getEnv("KINDROID_GREETING") ??
      DEFAULT_KINDROID_GREETING
    );
  }

  getKindroidParticipants(): KindroidParticipant[] {
    const storedParticipants = this.normalizeKindroidParticipants(
      this.readStore().kindroidParticipants
    );

    if (storedParticipants.length > 0) {
      return storedParticipants;
    }

    const legacyAiId =
      this.getStoredNonSecret("kindroidAiId") ?? this.getEnv("KINDROID_AI_ID");
    if (!legacyAiId) {
      return [];
    }

    return [this.buildLegacyKindroidParticipant(legacyAiId)];
  }

  getActiveKindroidParticipantId(): string | null {
    const participants = this.getKindroidParticipants();
    if (participants.length === 0) {
      return null;
    }

    return this.normalizeKindroidParticipantId(
      this.readStore().activeKindroidParticipantId,
      participants
    );
  }

  getActiveKindroidParticipant(): KindroidParticipant | null {
    const participants = this.getKindroidParticipants();
    const activeId = this.getActiveKindroidParticipantId();
    if (!activeId) {
      return null;
    }

    return participants.find((participant) => participant.id === activeId) ?? null;
  }

  getAvatarSelection(): AvatarSelection | null {
    const storedPath = this.getStoredNonSecret("avatarPath");
    if (!storedPath || !existsSync(storedPath)) {
      return null;
    }

    return this.createAvatarSelection(storedPath);
  }

  getRecentAvatarSelections(): AvatarSelection[] {
    const recentPaths = this.readStore().recentAvatarPaths ?? [];
    return recentPaths
      .map((filePath) => normalizeValue(filePath))
      .filter((filePath, index, allPaths) =>
        Boolean(filePath) &&
        existsSync(filePath) &&
        path.extname(filePath).toLowerCase() === ".vrm" &&
        allPaths.indexOf(filePath) === index
      )
      .slice(0, MAX_RECENT_AVATARS)
      .map((filePath) => this.createAvatarSelection(filePath));
  }

  readAvatarFile(filePath: string): ArrayBuffer {
    this.assertAvatarPath(filePath);
    const buffer = readFileSync(filePath);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
  }

  private getSettingsPath(): string {
    return path.join(app.getPath("userData"), "settings.json");
  }

  private readStore(): StoredSettings {
    if (this.cache) {
      return this.cache;
    }

    const settingsPath = this.getSettingsPath();
    if (!existsSync(settingsPath)) {
      this.cache = {};
      return this.cache;
    }

    try {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as StoredSettings;
      this.cache = parsed;
      return parsed;
    } catch {
      this.cache = {};
      return this.cache;
    }
  }

  private writeStore(settings: StoredSettings): void {
    const settingsPath = this.getSettingsPath();
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    this.cache = settings;
  }

  private getStoredNonSecret(key: keyof StoredSettings): string | null {
    const value = this.readStore()[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private getResolvedSecret(
    key: keyof NonNullable<StoredSettings["secrets"]>,
    envName: string
  ): string | null {
    const stored = this.readStore().secrets?.[key];
    const decoded = this.decodeSecret(stored);
    if (decoded) {
      return decoded;
    }

    return this.getEnv(envName);
  }

  private getEnv(name: string): string | null {
    const value = process.env[name]?.trim();
    return value ? value : null;
  }

  private normalizeKindroidParticipants(
    participants: KindroidParticipant[] | undefined
  ): KindroidParticipant[] {
    return (participants ?? [])
      .map((participant, index) => {
        const id = normalizeValue(participant?.id) || `kindroid-participant-${index + 1}`;
        const aiId = normalizeValue(participant?.aiId);
        const displayName = normalizeValue(participant?.displayName);
        const bubbleName = normalizeValue(participant?.bubbleName);
        const ttsProvider = participant?.ttsProvider ?? "none";

        if (!aiId || !displayName || !bubbleName) {
          return null;
        }

        return {
          id,
          aiId,
          displayName,
          bubbleName,
          ttsProvider,
          openAiVoice: normalizeValue(participant?.openAiVoice),
          openAiInstructions: normalizeValue(participant?.openAiInstructions),
          elevenLabsVoiceId: normalizeValue(participant?.elevenLabsVoiceId)
        };
      })
      .filter(
        (participant): participant is KindroidParticipant =>
          Boolean(participant)
      );
  }

  private normalizeKindroidParticipantId(
    activeId: string | undefined | null,
    participants: KindroidParticipant[]
  ): string | null {
    const normalizedId = normalizeValue(activeId);
    if (!participants.length) {
      return null;
    }

    if (normalizedId && participants.some((participant) => participant.id === normalizedId)) {
      return normalizedId;
    }

    return participants[0].id;
  }

  private buildLegacyKindroidParticipant(aiId: string): KindroidParticipant {
    const ttsProvider = this.readStore().preferences?.ttsProvider ?? DEFAULT_PREFERENCES.ttsProvider;

    return {
      id: LEGACY_KINDROID_PARTICIPANT_ID,
      aiId,
      displayName: "Kindroid",
      bubbleName: "Kindroid",
      ttsProvider,
      openAiVoice: this.getOpenAiTtsVoice(),
      openAiInstructions: this.getOpenAiTtsInstructions(),
      elevenLabsVoiceId: this.getElevenLabsVoiceId() ?? ""
    };
  }

  private encodeSecret(value: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(value).toString("base64")}`;
    }

    return value;
  }

  private decodeSecret(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    if (!value.startsWith("enc:")) {
      return value.trim() || null;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }

    try {
      return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
    } catch {
      return null;
    }
  }

  private assertAvatarPath(filePath: string): void {
    if (!existsSync(filePath)) {
      throw new Error("Selected avatar file no longer exists.");
    }

    if (path.extname(filePath).toLowerCase() !== ".vrm") {
      throw new Error("Avatar selection must point to a .vrm file.");
    }
  }

  private buildRecentAvatarPaths(
    filePath: string,
    existingPaths: string[] | undefined
  ): string[] {
    return [filePath, ...(existingPaths ?? [])]
      .map((value) => normalizeValue(value))
      .filter((value, index, allValues) => Boolean(value) && allValues.indexOf(value) === index)
      .slice(0, MAX_RECENT_AVATARS);
  }

  private createAvatarSelection(filePath: string): AvatarSelection {
    return {
      path: filePath,
      label: path.basename(filePath),
      fileUrl: pathToFileURL(filePath).href
    };
  }
}

let settingsService: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  settingsService ??= new SettingsService();
  return settingsService;
}
