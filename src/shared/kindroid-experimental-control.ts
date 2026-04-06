export type KindroidExperimentalControlState = {
  enabled: boolean;
  configured: boolean;
  apiKeyPresent: boolean;
  aiIdPresent: boolean;
  baseUrl: string | null;
};

export type UserCustomAvatar = {
  custom_avatar_url: string;
  custom_avatar_description?: string;
  custom_avatar_fidelity?: number;
  custom_avatar_face_prompt?: string;
  custom_avatar_face_detail?: number;
  avatar_is_anime?: boolean;
};

export type UpdateUserProfileOptions = {
  active_persona_id?: string;
  user_name?: string;
  user_gender?: string;
  user_backstory?: string;
  user_custom_avatar?: UserCustomAvatar;
};

export type CreateKinOptions = {
  ai_name: string;
  ai_gender: string;
  ai_backstory: string;
  custom_greeting?: string;
  ai_directive?: string;
  ai_avatar?: number;
  custom_avatar_url?: string;
  custom_avatar_description?: string;
  custom_avatar_fidelity?: number;
  custom_avatar_face_detail?: number;
  custom_avatar_face_prompt?: string;
  avatar_is_anime?: boolean;
};

export type UpdateKinOptions = {
  ai_id: string;
  ai_name?: string;
  ai_gender?: string;
  ai_backstory?: string;
  ai_memory?: string;
  ai_example_message?: string;
  ai_directive?: string;
  ai_additional_context?: string;
  ai_avatar?: number;
  custom_avatar_url?: string;
  custom_avatar_description?: string;
  custom_avatar_fidelity?: number;
  custom_avatar_face_detail?: number;
  custom_avatar_face_prompt?: string;
  avatar_is_anime?: boolean;
  unset_custom_avatar_animation?: boolean;
  user_set_temperature?: number;
  reasoning_effort?: string;
  llm_flair?: string;
  proactive_mode?: boolean;
  proactive_action_directive?: string;
  time_awareness?: boolean;
  show_auto_selfies_in_chat?: boolean;
  current_scene?: string;
};

export type RequestSelfieOptions = {
  ai_id: string;
  prompt: string;
  aspect?: "square" | "portrait" | "landscape";
  uses_nsfw?: boolean;
  seed?: number | null;
};

export type RequestGroupSelfieOptions = {
  version: string;
  ai_ids: string[];
  full_photo_prompt: string;
  regional_prompts?: string[];
  aspect?: "square" | "portrait" | "landscape";
  uses_nsfw?: boolean;
  seed?: number | null;
};

export type CreateJournalEntryOptions = {
  ai_id: string;
  entry: string;
  keyphrases: string[];
};

export type SubscriptionInfo = {
  uid: string;
  status: string;
  isSubscribedBase: boolean;
  subscriptionPlatformBase: string | null;
  gracePeriodBase: number | null;
  isSubscribedAddon1: boolean;
  subscriptionPlatformAddon1: string | null;
  gracePeriodAddon1: number | null;
  isSubscribedAddon2: boolean;
  subscriptionPlatformAddon2: string | null;
  gracePeriodAddon2: number | null;
};

export type CreateGroupChatOptions = {
  ai_list: string[];
  group_name: string;
  group_context?: string;
  group_directive?: string;
  use_manual_turntaking?: boolean;
  share_short_term_memory?: boolean;
  disable_ltm_recall?: boolean;
  disable_ltm_consolidate?: boolean;
  user_persona_id?: string;
};

export type UpdateGroupChatOptions = {
  group_id: string;
  ai_list?: string[];
  group_name?: string;
  group_context?: string;
  group_directive?: string;
  use_manual_turntaking?: boolean;
  share_short_term_memory?: boolean;
  disable_ltm_recall?: boolean;
  disable_ltm_consolidate?: boolean;
  user_persona_id?: string;
};

export type SendGroupChatMessageOptions = {
  group_id: string;
  message: string;
  image_urls?: string[];
  image_description?: string;
  video_url?: string;
  video_description?: string;
  link_url?: string;
  link_description?: string;
};

export type GroupChatGetTurnOptions = {
  group_id: string;
  allow_user?: boolean;
};

export type GroupChatAiResponseOptions = {
  ai_id: string;
  group_id: string;
  request_id?: string;
};

export type SuggestUserMessageOptions = {
  ai_id: string;
  existing_message?: string;
};

export type SuggestUserGroupMessageOptions = {
  group_id: string;
  existing_message?: string;
};

export type KindroidExperimentalAccountBridge = {
  checkSubscription: () => Promise<SubscriptionInfo>;
};

export type KindroidExperimentalProfileBridge = {
  updateUserProfile: (options: UpdateUserProfileOptions) => Promise<void>;
};

export type KindroidExperimentalKinBridge = {
  create: (options: CreateKinOptions) => Promise<string>;
  update: (options: UpdateKinOptions) => Promise<void>;
  createJournalEntry: (options: CreateJournalEntryOptions) => Promise<void>;
};

export type KindroidExperimentalMediaBridge = {
  requestSelfie: (options: RequestSelfieOptions) => Promise<void>;
  requestGroupSelfie: (options: RequestGroupSelfieOptions) => Promise<void>;
};

export type KindroidExperimentalGroupChatBridge = {
  create: (options: CreateGroupChatOptions) => Promise<string>;
  update: (options: UpdateGroupChatOptions) => Promise<void>;
  sendMessage: (options: SendGroupChatMessageOptions) => Promise<string>;
  getTurn: (options: GroupChatGetTurnOptions) => Promise<string>;
  aiResponse: (options: GroupChatAiResponseOptions) => Promise<string>;
};

export type KindroidExperimentalSuggestionBridge = {
  userMessage: (options: SuggestUserMessageOptions) => Promise<string>;
  userGroupMessage: (options: SuggestUserGroupMessageOptions) => Promise<string>;
};

export type KindroidExperimentalBridge = {
  getState: () => Promise<KindroidExperimentalControlState>;
  account: KindroidExperimentalAccountBridge;
  profile: KindroidExperimentalProfileBridge;
  kin: KindroidExperimentalKinBridge;
  media: KindroidExperimentalMediaBridge;
  groupChats: KindroidExperimentalGroupChatBridge;
  suggestions: KindroidExperimentalSuggestionBridge;
};
