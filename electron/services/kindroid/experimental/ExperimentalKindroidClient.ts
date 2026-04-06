import "dotenv/config";

import type {
  CreateGroupChatOptions,
  CreateJournalEntryOptions,
  CreateKinOptions,
  GroupChatAiResponseOptions,
  GroupChatGetTurnOptions,
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
} from "../../../../src/shared/kindroid-experimental-control";
import { getSettingsService } from "../../SettingsService";
import { KindroidHttpClient, kindroidTimeouts } from "../core/KindroidHttpClient";

export class ExperimentalKindroidClient {
  getState(): KindroidExperimentalControlState {
    const settings = getSettingsService();
    const enabled = settings.getKindroidExperimentalEnabled();
    const apiKeyPresent = Boolean(settings.getKindroidApiKey());
    const aiIdPresent = Boolean(settings.getKindroidAiId());

    return {
      enabled,
      configured: enabled && apiKeyPresent,
      apiKeyPresent,
      aiIdPresent,
      baseUrl: settings.getKindroidBaseUrl()
    };
  }

  async updateUserProfile(options: UpdateUserProfileOptions): Promise<void> {
    await this.createRequestClient().requestWithRetry(
      "/update-info",
      {
        ...(options.active_persona_id !== undefined
          ? { active_persona_id: options.active_persona_id }
          : {}),
        ...(options.user_name !== undefined ? { user_name: options.user_name } : {}),
        ...(options.user_gender !== undefined ? { user_gender: options.user_gender } : {}),
        ...(options.user_backstory !== undefined
          ? { user_backstory: options.user_backstory }
          : {}),
        ...(options.user_custom_avatar !== undefined
          ? { user_custom_avatar: options.user_custom_avatar }
          : {})
      },
      "void"
    );
  }

  async createKin(options: CreateKinOptions): Promise<string> {
    return this.createRequestClient().requestWithRetry(
      "/create-new-ai",
      {
        ai_name: options.ai_name,
        ai_gender: options.ai_gender,
        ai_backstory: options.ai_backstory,
        ai_avatar: options.ai_avatar ?? -1,
        avatar_is_anime: options.avatar_is_anime ?? false,
        ai_directive: options.ai_directive ?? "",
        ...(options.custom_greeting ? { custom_greeting: options.custom_greeting } : {}),
        ...(options.custom_avatar_url
          ? { custom_avatar_url: options.custom_avatar_url }
          : {}),
        ...(options.custom_avatar_description
          ? { custom_avatar_description: options.custom_avatar_description }
          : {}),
        ...(options.custom_avatar_fidelity !== undefined
          ? { custom_avatar_fidelity: options.custom_avatar_fidelity }
          : {}),
        ...(options.custom_avatar_face_detail !== undefined
          ? { custom_avatar_face_detail: options.custom_avatar_face_detail }
          : {}),
        ...(options.custom_avatar_face_prompt
          ? { custom_avatar_face_prompt: options.custom_avatar_face_prompt }
          : {})
      },
      "text"
    );
  }

  async updateKin(options: UpdateKinOptions): Promise<void> {
    await this.createRequestClient().requestWithRetry(
      "/update-info",
      {
        ai_id: options.ai_id,
        ...(options.ai_name !== undefined ? { ai_name: options.ai_name } : {}),
        ...(options.ai_gender !== undefined ? { ai_gender: options.ai_gender } : {}),
        ...(options.ai_backstory !== undefined ? { ai_backstory: options.ai_backstory } : {}),
        ...(options.ai_memory !== undefined ? { ai_memory: options.ai_memory } : {}),
        ...(options.ai_example_message !== undefined
          ? { ai_example_message: options.ai_example_message }
          : {}),
        ...(options.ai_directive !== undefined ? { ai_directive: options.ai_directive } : {}),
        ...(options.ai_additional_context !== undefined
          ? { ai_additional_context: options.ai_additional_context }
          : {}),
        ...(options.ai_avatar !== undefined ? { ai_avatar: options.ai_avatar } : {}),
        ...(options.custom_avatar_url !== undefined
          ? { custom_avatar_url: options.custom_avatar_url }
          : {}),
        ...(options.custom_avatar_description !== undefined
          ? { custom_avatar_description: options.custom_avatar_description }
          : {}),
        ...(options.custom_avatar_fidelity !== undefined
          ? { custom_avatar_fidelity: options.custom_avatar_fidelity }
          : {}),
        ...(options.custom_avatar_face_detail !== undefined
          ? { custom_avatar_face_detail: options.custom_avatar_face_detail }
          : {}),
        ...(options.custom_avatar_face_prompt !== undefined
          ? { custom_avatar_face_prompt: options.custom_avatar_face_prompt }
          : {}),
        ...(options.avatar_is_anime !== undefined
          ? { avatar_is_anime: options.avatar_is_anime }
          : {}),
        ...(options.unset_custom_avatar_animation !== undefined
          ? { unset_custom_avatar_animation: options.unset_custom_avatar_animation }
          : {}),
        ...(options.user_set_temperature !== undefined
          ? { user_set_temperature: options.user_set_temperature }
          : {}),
        ...(options.reasoning_effort !== undefined
          ? { reasoning_effort: options.reasoning_effort }
          : {}),
        ...(options.llm_flair !== undefined ? { llm_flair: options.llm_flair } : {}),
        ...(options.proactive_mode !== undefined
          ? { proactive_mode: options.proactive_mode }
          : {}),
        ...(options.proactive_action_directive !== undefined
          ? { proactive_action_directive: options.proactive_action_directive }
          : {}),
        ...(options.time_awareness !== undefined
          ? { time_awareness: options.time_awareness }
          : {}),
        ...(options.show_auto_selfies_in_chat !== undefined
          ? { show_auto_selfies_in_chat: options.show_auto_selfies_in_chat }
          : {}),
        ...(options.current_scene !== undefined ? { current_scene: options.current_scene } : {})
      },
      "void"
    );
  }

  async requestSelfie(options: RequestSelfieOptions): Promise<void> {
    await this.createRequestClient().requestWithRetry(
      "/selfie-request",
      {
        ai_id: options.ai_id,
        prompt: options.prompt,
        aspect: options.aspect ?? "square",
        uses_nsfw: options.uses_nsfw ?? false,
        custom_pose_url: "",
        custom_style_url: "",
        custom_style_weight: null,
        seed: options.seed ?? null
      },
      "void"
    );
  }

  async requestGroupSelfie(options: RequestGroupSelfieOptions): Promise<void> {
    await this.createRequestClient().requestWithRetry(
      "/group-selfie-request",
      {
        version: options.version,
        ai_ids: options.ai_ids,
        full_photo_prompt: options.full_photo_prompt,
        regional_prompts: options.regional_prompts ?? options.ai_ids.map(() => ""),
        aspect: options.aspect ?? "square",
        uses_nsfw: options.uses_nsfw ?? false,
        pose_strictness: 0.65,
        seed: options.seed ?? null
      },
      "void"
    );
  }

  async createJournalEntry(options: CreateJournalEntryOptions): Promise<void> {
    await this.createRequestClient().requestWithRetry(
      "/journal-create",
      {
        ai_id: options.ai_id,
        entry: options.entry,
        keyphrases: options.keyphrases
      },
      "void"
    );
  }

  async checkSubscription(): Promise<SubscriptionInfo> {
    return this.createRequestClient().requestWithRetry(
      "/check-user-subscription",
      {},
      "json"
    );
  }

  async createGroupChat(options: CreateGroupChatOptions): Promise<string> {
    return this.createRequestClient().requestWithRetry(
      "/groupchats-create",
      {
        ai_list: options.ai_list,
        group_name: options.group_name,
        group_context: options.group_context ?? "",
        group_directive: options.group_directive ?? "",
        use_manual_turntaking: options.use_manual_turntaking ?? false,
        share_short_term_memory: options.share_short_term_memory ?? false,
        disable_ltm_recall: options.disable_ltm_recall ?? false,
        disable_ltm_consolidate: options.disable_ltm_consolidate ?? false,
        ...(options.user_persona_id ? { user_persona_id: options.user_persona_id } : {})
      },
      "text"
    );
  }

  async updateGroupChat(options: UpdateGroupChatOptions): Promise<void> {
    await this.createRequestClient().requestWithRetry(
      "/groupchats-update",
      {
        group_id: options.group_id,
        ...(options.ai_list !== undefined ? { ai_list: options.ai_list } : {}),
        ...(options.group_name !== undefined ? { group_name: options.group_name } : {}),
        ...(options.group_context !== undefined
          ? { group_context: options.group_context }
          : {}),
        ...(options.group_directive !== undefined
          ? { group_directive: options.group_directive }
          : {}),
        ...(options.use_manual_turntaking !== undefined
          ? { use_manual_turntaking: options.use_manual_turntaking }
          : {}),
        ...(options.share_short_term_memory !== undefined
          ? { share_short_term_memory: options.share_short_term_memory }
          : {}),
        ...(options.disable_ltm_recall !== undefined
          ? { disable_ltm_recall: options.disable_ltm_recall }
          : {}),
        ...(options.disable_ltm_consolidate !== undefined
          ? { disable_ltm_consolidate: options.disable_ltm_consolidate }
          : {}),
        ...(options.user_persona_id !== undefined
          ? { user_persona_id: options.user_persona_id }
          : {})
      },
      "void"
    );
  }

  async sendGroupChatMessage(options: SendGroupChatMessageOptions): Promise<string> {
    return this.createRequestClient().requestWithRetry(
      "/groupchats-user-message",
      {
        group_id: options.group_id,
        message: options.message,
        ...(options.image_urls?.length ? { image_urls: options.image_urls } : {}),
        ...(options.image_description
          ? { image_description: options.image_description }
          : {}),
        ...(options.video_url ? { video_url: options.video_url } : {}),
        ...(options.video_description
          ? { video_description: options.video_description }
          : {}),
        ...(options.link_url ? { link_url: options.link_url } : {}),
        ...(options.link_description
          ? { link_description: options.link_description }
          : {})
      },
      "text",
      kindroidTimeouts.sendMessage
    );
  }

  async groupChatGetTurn(options: GroupChatGetTurnOptions): Promise<string> {
    return this.createRequestClient().requestWithRetry(
      "/groupchats-get-turn",
      {
        group_id: options.group_id,
        allow_user: options.allow_user ?? true
      },
      "text"
    );
  }

  async groupChatAiResponse(options: GroupChatAiResponseOptions): Promise<string> {
    const requestId =
      options.request_id ??
      `group-ai-${options.group_id}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    return this.createRequestClient().requestWithRetry(
      "/groupchats-ai-response",
      {
        ai_id: options.ai_id,
        group_id: options.group_id,
        stream: false,
        request_id: requestId
      },
      "text",
      kindroidTimeouts.sendMessage
    );
  }

  async suggestUserMessage(options: SuggestUserMessageOptions): Promise<string> {
    return this.createRequestClient().requestWithRetry(
      "/suggest-user-message",
      {
        ai_id: options.ai_id,
        existing_message: options.existing_message ?? "",
        stream: false
      },
      "text",
      kindroidTimeouts.sendMessage
    );
  }

  async suggestUserGroupMessage(options: SuggestUserGroupMessageOptions): Promise<string> {
    return this.createRequestClient().requestWithRetry(
      "/suggest-user-group-message",
      {
        group_id: options.group_id,
        existing_message: options.existing_message ?? "",
        stream: false
      },
      "text",
      kindroidTimeouts.sendMessage
    );
  }

  private createRequestClient(): KindroidHttpClient {
    const settings = getSettingsService();
    const apiKey = settings.getKindroidApiKey();

    if (!settings.getKindroidExperimentalEnabled()) {
      throw new Error("Kindroid experimental endpoints are disabled.");
    }

    if (!apiKey) {
      throw new Error("Kindroid is not configured. Add KINDROID_API_KEY.");
    }

    return new KindroidHttpClient(apiKey, settings.getKindroidBaseUrl());
  }
}
