import type {
  KindroidConversationMode,
  KindroidGroupMirror
} from "../shared/kindroid-group-mirrors";
import type { KindroidParticipant } from "../shared/kindroid-participants";
import type { AssistantStateSnapshot } from "../shared/assistant-state";
import type { ConversationTurn } from "../shared/conversation-types";
import type { AudioFormat, CadenceEvent } from "../shared/voice-events";

export type Unsubscribe = () => void;

export type TransportConfig = {
  model: string;
  voice: string;
  instructions: string;
  speechInstructions?: string;
  kindroidConversationMode?: KindroidConversationMode;
  kindroidParticipants?: KindroidParticipant[];
  kindroidGroupMirror?: KindroidGroupMirror | null;
  kindroidManualSpeakerParticipantId?: string | null;
  modalities: Array<"text" | "audio">;
};

export type TranscriptRequest = {
  audio: Blob;
  language?: string;
};

export type SpeechRequest = {
  turnId: string;
  text: string;
  voice: string;
};

export type ConversationRequest = {
  transcript: string;
  turns: ConversationTurn[];
};

export type TextTurnInput = {
  speaker: "user" | "assistant";
  text: string;
};

export type ConversationResponse = {
  text: string;
  shouldSpeak: boolean;
};

export interface ConversationEngine {
  respond(request: ConversationRequest): Promise<ConversationResponse>;
}

export interface LiveConversationTransport {
  readonly id: string;
  readonly label: string;
  connect(config: TransportConfig): Promise<void>;
  disconnect(): Promise<void>;
  sendUserText(text: string, turns?: TextTurnInput[]): Promise<void>;
  sendUserAudio(audio: ArrayBuffer): Promise<void>;
  interruptAssistant(reason?: "user_barge_in" | "operator_stop"): Promise<void>;
  subscribe(listener: (event: CadenceEvent) => void): Unsubscribe;
}

export interface TranscriptAdapter {
  readonly id: string;
  transcribe(request: TranscriptRequest): Promise<string>;
}

export interface SpeechOutputAdapter {
  readonly id: string;
  speak(request: SpeechRequest): Promise<void>;
  enqueueAudioChunk(
    turnId: string,
    sequence: number,
    format: AudioFormat,
    data: ArrayBuffer
  ): Promise<void>;
  interrupt(): Promise<void>;
}

export interface PresenceController {
  pushState(state: AssistantStateSnapshot): void;
}
