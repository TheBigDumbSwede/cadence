import { contextBridge, ipcRenderer } from "electron";
import type { ElevenLabsBridge, ElevenLabsControlState } from "../src/shared/elevenlabs-control";
import type {
  CreateGroupChatOptions,
  CreateJournalEntryOptions,
  CreateKinOptions,
  GroupChatAiResponseOptions,
  GroupChatGetTurnOptions,
  KindroidExperimentalBridge,
  KindroidExperimentalControlState,
  RequestGroupSelfieOptions,
  RequestSelfieOptions,
  SendGroupChatMessageOptions,
  SubscriptionInfo,
  SuggestUserGroupMessageOptions,
  SuggestUserMessageOptions,
  UpdateGroupChatOptions,
  UpdateKinOptions,
  UpdateUserProfileOptions
} from "../src/shared/kindroid-experimental-control";
import type { KindroidBridge, KindroidControlState } from "../src/shared/kindroid-control";
import type {
  MemoryBridge,
  MemoryControlState,
  MemoryIngestRequest,
  MemoryIngestResult,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryScope,
  MemoryStoredItem,
  MemoryStoredSession
} from "../src/shared/memory-control";
import type { OpenAiAudioBridge, OpenAiAudioControlState } from "../src/shared/openai-audio-control";
import type { OpenAiSpeechBridge, OpenAiSpeechControlState } from "../src/shared/openai-speech-control";
import type {
  RealtimeBridge,
  RealtimeControlState,
  RealtimeSessionConfig
} from "../src/shared/realtime-control";
import type { SettingsSnapshot, SettingsUpdate } from "../src/shared/app-settings";
import type { SettingsBridge } from "../src/shared/settings-control";
import type {
  TextBridge,
  TextControlState,
  TextResponseOptions
} from "../src/shared/text-control";
import type { RuntimeInfo } from "../src/shared/runtime-info";
import type {
  SpeechCaptionCue,
  SpeechCaptionMode
} from "../src/shared/speech-captions";
import type { CadenceEvent } from "../src/shared/voice-events";

const cadenceBridge = {
  elevenlabs: {
    getState: () =>
      ipcRenderer.invoke("elevenlabs:get-state") as Promise<ElevenLabsControlState>,
    synthesize: (text: string, options?: { voiceId?: string }) =>
      ipcRenderer.invoke("elevenlabs:synthesize", text, options) as Promise<{
        audio: ArrayBuffer;
        format: "mp3";
        model: string;
        voiceId: string;
        captions: SpeechCaptionCue[];
        captionsMode: SpeechCaptionMode;
      }>,
    synthesizeSoundEffect: (
      text: string,
      options?: { durationSeconds?: number; promptInfluence?: number }
    ) =>
      ipcRenderer.invoke("elevenlabs:synthesize-sound-effect", text, options) as Promise<{
        audio: ArrayBuffer;
        format: "mp3";
        model: string;
      }>
  } satisfies ElevenLabsBridge,
  getRuntimeInfo: () => ipcRenderer.invoke("app:get-runtime-info") as Promise<RuntimeInfo>,
  kindroid: {
    getState: () =>
      ipcRenderer.invoke("kindroid:get-state") as Promise<KindroidControlState>,
    createResponse: (input: string) =>
      ipcRenderer.invoke("kindroid:create-response", input) as Promise<{
        text: string;
        provider: "kindroid";
      }>,
    chatBreak: (greeting: string) =>
      ipcRenderer.invoke("kindroid:chat-break", greeting) as Promise<void>
  } satisfies KindroidBridge,
  kindroidExperimental: {
    getState: () =>
      ipcRenderer.invoke("kindroid-experimental:get-state") as Promise<KindroidExperimentalControlState>,
    account: {
      checkSubscription: () =>
        ipcRenderer.invoke("kindroid-experimental:account:check-subscription") as Promise<SubscriptionInfo>
    },
    profile: {
      updateUserProfile: (options: UpdateUserProfileOptions) =>
        ipcRenderer.invoke("kindroid-experimental:profile:update-user-profile", options) as Promise<void>
    },
    kin: {
      create: (options: CreateKinOptions) =>
        ipcRenderer.invoke("kindroid-experimental:kin:create", options) as Promise<string>,
      update: (options: UpdateKinOptions) =>
        ipcRenderer.invoke("kindroid-experimental:kin:update", options) as Promise<void>,
      createJournalEntry: (options: CreateJournalEntryOptions) =>
        ipcRenderer.invoke("kindroid-experimental:kin:create-journal-entry", options) as Promise<void>
    },
    media: {
      requestSelfie: (options: RequestSelfieOptions) =>
        ipcRenderer.invoke("kindroid-experimental:media:request-selfie", options) as Promise<void>,
      requestGroupSelfie: (options: RequestGroupSelfieOptions) =>
        ipcRenderer.invoke("kindroid-experimental:media:request-group-selfie", options) as Promise<void>
    },
    groupChats: {
      create: (options: CreateGroupChatOptions) =>
        ipcRenderer.invoke("kindroid-experimental:group-chats:create", options) as Promise<string>,
      update: (options: UpdateGroupChatOptions) =>
        ipcRenderer.invoke("kindroid-experimental:group-chats:update", options) as Promise<void>,
      sendMessage: (options: SendGroupChatMessageOptions) =>
        ipcRenderer.invoke("kindroid-experimental:group-chats:send-message", options) as Promise<string>,
      getTurn: (options: GroupChatGetTurnOptions) =>
        ipcRenderer.invoke("kindroid-experimental:group-chats:get-turn", options) as Promise<string>,
      aiResponse: (options: GroupChatAiResponseOptions) =>
        ipcRenderer.invoke("kindroid-experimental:group-chats:ai-response", options) as Promise<string>
    },
    suggestions: {
      userMessage: (options: SuggestUserMessageOptions) =>
        ipcRenderer.invoke("kindroid-experimental:suggestions:user-message", options) as Promise<string>,
      userGroupMessage: (options: SuggestUserGroupMessageOptions) =>
        ipcRenderer.invoke("kindroid-experimental:suggestions:user-group-message", options) as Promise<string>
    }
  } satisfies KindroidExperimentalBridge,
  memory: {
    getState: () =>
      ipcRenderer.invoke("memory:get-state") as Promise<MemoryControlState>,
    list: (profileId?: string) =>
      ipcRenderer.invoke("memory:list", profileId) as Promise<MemoryStoredItem[]>,
    listSessions: (profileId?: string) =>
      ipcRenderer.invoke("memory:list-sessions", profileId) as Promise<MemoryStoredSession[]>,
    recall: (request: MemoryRecallRequest) =>
      ipcRenderer.invoke("memory:recall", request) as Promise<MemoryRecallResult>,
    ingest: (request: MemoryIngestRequest) =>
      ipcRenderer.invoke("memory:ingest", request) as Promise<MemoryIngestResult>,
    closeSession: (scope: MemoryScope) =>
      ipcRenderer.invoke("memory:close-session", scope) as Promise<void>,
    deleteMany: (ids: string[], profileId?: string) =>
      ipcRenderer.invoke("memory:delete-many", ids, profileId) as Promise<{ deleted: number }>,
    deleteAll: (profileId?: string) =>
      ipcRenderer.invoke("memory:delete-all", profileId) as Promise<{ deleted: number }>,
    deleteSessions: (conversationIds: string[], profileId?: string) =>
      ipcRenderer.invoke("memory:delete-sessions", conversationIds, profileId) as Promise<{
        deleted: number;
      }>,
    deleteAllSessions: (profileId?: string) =>
      ipcRenderer.invoke("memory:delete-all-sessions", profileId) as Promise<{
        deleted: number;
      }>
  } satisfies MemoryBridge,
  openaiAudio: {
    getState: () =>
      ipcRenderer.invoke("openai-audio:get-state") as Promise<OpenAiAudioControlState>,
    transcribe: (audio: ArrayBuffer) =>
      ipcRenderer.invoke("openai-audio:transcribe", audio) as Promise<{
        text: string;
        model: string;
      }>
  } satisfies OpenAiAudioBridge,
  openaiSpeech: {
    getState: () =>
      ipcRenderer.invoke("openai-speech:get-state") as Promise<OpenAiSpeechControlState>,
    synthesize: (text: string, options?: { voice?: string; instructions?: string }) =>
      ipcRenderer.invoke("openai-speech:synthesize", text, options) as Promise<{
        audio: ArrayBuffer;
        format: "mp3";
        model: string;
        voice: string;
        captions: SpeechCaptionCue[];
        captionsMode: SpeechCaptionMode;
      }>
  } satisfies OpenAiSpeechBridge,
  settings: {
    get: () => ipcRenderer.invoke("settings:get") as Promise<SettingsSnapshot>,
    update: (update: SettingsUpdate) =>
      ipcRenderer.invoke("settings:update", update) as Promise<SettingsSnapshot>
  } satisfies SettingsBridge,
  realtime: {
    connect: (config?: RealtimeSessionConfig) =>
      ipcRenderer.invoke("realtime:connect", config) as Promise<void>,
    disconnect: () => ipcRenderer.invoke("realtime:disconnect") as Promise<void>,
    sendUserText: (text: string) =>
      ipcRenderer.invoke("realtime:send-user-text", text) as Promise<void>,
    sendUserAudio: (audio: ArrayBuffer) =>
      ipcRenderer.invoke("realtime:send-user-audio", audio) as Promise<void>,
    interruptAssistant: (reason?: "user_barge_in" | "operator_stop") =>
      ipcRenderer.invoke("realtime:interrupt-assistant", reason) as Promise<void>,
    getState: () =>
      ipcRenderer.invoke("realtime:get-state") as Promise<RealtimeControlState>,
    onEvent: (listener: (event: CadenceEvent) => void) => {
      const handler = (_event: unknown, payload: CadenceEvent) => {
        listener(payload);
      };

      ipcRenderer.on("realtime:event", handler);
      return () => {
        ipcRenderer.removeListener("realtime:event", handler);
      };
    }
  } satisfies RealtimeBridge,
  text: {
    getState: () =>
      ipcRenderer.invoke("text:get-state") as Promise<TextControlState>,
    createResponse: (
      input: string,
      options?: TextResponseOptions
    ) =>
      ipcRenderer.invoke("text:create-response", input, options) as Promise<{
        text: string;
        model: string;
      }>
  } satisfies TextBridge
};

contextBridge.exposeInMainWorld("cadence", cadenceBridge);
