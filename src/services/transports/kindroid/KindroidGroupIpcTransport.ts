import { getCadenceBridge } from "../../bridge";
import type {
  LiveConversationTransport,
  TransportConfig,
  Unsubscribe
} from "../../contracts";
import type { KindroidParticipant } from "../../../shared/kindroid-participants";
import type { CadenceEvent } from "../../../shared/voice-events";

export class KindroidGroupIpcTransport implements LiveConversationTransport {
  readonly id = "kindroid-group-text";
  readonly label = "Kindroid Group";

  private readonly listeners = new Set<(event: CadenceEvent) => void>();
  private config: TransportConfig | null = null;

  async connect(config: TransportConfig): Promise<void> {
    this.config = config;
    const state = await getCadenceBridge().kindroidExperimental.getState();

    if (!state.enabled) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "Kindroid experimental endpoints are disabled.",
        recoverable: false
      });
      throw new Error("Kindroid experimental endpoints are disabled.");
    }

    if (!state.configured) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "Kindroid experimental group chat is not configured.",
        recoverable: false
      });
      throw new Error("Kindroid experimental group chat is not configured.");
    }

    if (!this.config?.kindroidGroupMirror?.groupId) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "No active Kindroid group mirror is selected.",
        recoverable: false
      });
      throw new Error("No active Kindroid group mirror is selected.");
    }

    const groupParticipants = (this.config?.kindroidParticipants ?? []).filter((participant) =>
      this.config?.kindroidGroupMirror?.participantIds.includes(participant.id)
    );
    if (groupParticipants.length === 0) {
      this.emit({
        type: "transport.error",
        provider: this.id,
        message: "The active Kindroid group mirror has no valid local participants.",
        recoverable: false
      });
      throw new Error("The active Kindroid group mirror has no valid local participants.");
    }

    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
  }

  async disconnect(): Promise<void> {
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "disconnected"
    });
  }

  async sendUserText(text: string): Promise<void> {
    if (!text.trim()) {
      return;
    }

    const userTurnId = crypto.randomUUID();
    this.emit({
      type: "transcript.final",
      turnId: userTurnId,
      text
    });
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "thinking"
    });

    await this.respondFromText(text);
  }

  async sendUserAudio(_audio: ArrayBuffer): Promise<void> {
    this.emit({
      type: "transport.error",
      provider: this.id,
      message: "Kindroid group transport is text-only for now.",
      recoverable: true
    });
  }

  async interruptAssistant(
    reason: "user_barge_in" | "operator_stop" = "operator_stop"
  ): Promise<void> {
    this.emit({
      type: "assistant.interrupted",
      reason
    });
  }

  subscribe(listener: (event: CadenceEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async respondFromText(input: string): Promise<void> {
    const groupMirror = this.config?.kindroidGroupMirror;
    if (!groupMirror?.groupId) {
      throw new Error("No active Kindroid group mirror is selected.");
    }

    const bridge = getCadenceBridge();
    await bridge.kindroidExperimental.groupChats.sendMessage({
      group_id: groupMirror.groupId,
      message: input
    });

    const respondingParticipant = await this.resolveRespondingParticipant();
    const response = await bridge.kindroidExperimental.groupChats.aiResponse({
      ai_id: respondingParticipant.aiId,
      group_id: groupMirror.groupId
    });

    const assistantTurnId = crypto.randomUUID();
    this.emit({
      type: "assistant.response.delta",
      turnId: assistantTurnId,
      text: response,
      speakerLabel: respondingParticipant.bubbleName,
      kindroidParticipantId: respondingParticipant.id
    });
    this.emit({
      type: "assistant.response.completed",
      turnId: assistantTurnId,
      text: response,
      speakerLabel: respondingParticipant.bubbleName,
      kindroidParticipantId: respondingParticipant.id
    });
    this.emit({
      type: "session.status",
      provider: this.id,
      status: "ready"
    });
  }

  private async resolveRespondingParticipant(): Promise<KindroidParticipant> {
    const groupMirror = this.config?.kindroidGroupMirror;
    const participants = this.config?.kindroidParticipants ?? [];

    if (!groupMirror) {
      throw new Error("No active Kindroid group mirror is selected.");
    }

    const groupParticipants = participants.filter((participant) =>
      groupMirror.participantIds.includes(participant.id)
    );

    if (groupParticipants.length === 0) {
      throw new Error("The active Kindroid group mirror has no valid local participants.");
    }

    if (groupMirror.manualTurnTaking) {
      const manualParticipant =
        groupParticipants.find(
          (participant) =>
            participant.id === this.config?.kindroidManualSpeakerParticipantId
        ) ?? groupParticipants[0];

      return manualParticipant;
    }

    const speakerAiId = await getCadenceBridge().kindroidExperimental.groupChats.getTurn({
      group_id: groupMirror.groupId,
      allow_user: false
    });
    const respondingParticipant = groupParticipants.find(
      (participant) => participant.aiId === speakerAiId
    );

    if (!respondingParticipant) {
      throw new Error(
        `Kindroid returned a speaker (${speakerAiId}) that is not in the mirrored local roster.`
      );
    }

    return respondingParticipant;
  }

  private emit(event: CadenceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
