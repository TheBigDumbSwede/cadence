export type PreviewAssistantStateId =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

export type AssistantStateSnapshot = {
  type: PreviewAssistantStateId;
  badge: string;
  title: string;
  detail: string;
};

export const previewAssistantStates: Array<{
  id: PreviewAssistantStateId;
  label: string;
  detail: string;
}> = [
  {
    id: "idle",
    label: "Idle",
    detail: "Waiting without looking dead."
  },
  {
    id: "listening",
    label: "Listening",
    detail: "Mic hot, interruption ready."
  },
  {
    id: "transcribing",
    label: "Transcribing",
    detail: "Speech becoming usable text."
  },
  {
    id: "thinking",
    label: "Thinking",
    detail: "Reasoning before the voice starts."
  },
  {
    id: "speaking",
    label: "Speaking",
    detail: "Reply is already on its way out."
  },
  {
    id: "error",
    label: "Error",
    detail: "Failure should be legible, not mysterious."
  }
];

export function buildAssistantSnapshot(id: PreviewAssistantStateId): AssistantStateSnapshot {
  switch (id) {
    case "listening":
      return {
        type: id,
        badge: "Listening",
        title: "Ready for the next utterance",
        detail:
          "The UI should acknowledge speech almost immediately. Silence is acceptable; ambiguity is not."
      };
    case "transcribing":
      return {
        type: id,
        badge: "Transcribing",
        title: "Speech is becoming turn state",
        detail:
          "Partial transcript feedback buys trust while the real work continues in the background."
      };
    case "thinking":
      return {
        type: id,
        badge: "Thinking",
        title: "Reason before delivery",
        detail:
          "This state should be brief and explicit, otherwise the app starts to feel frozen even when it is merely busy."
      };
    case "speaking":
      return {
        type: id,
        badge: "Speaking",
        title: "Reply is out loud now",
        detail:
          "Speech playback needs hard interruption semantics. If the user cuts in, downstream audio work loses."
      };
    case "error":
      return {
        type: id,
        badge: "Error",
        title: "Failures should degrade with dignity",
        detail:
          "Voice apps feel especially brittle when errors disappear into the background. Surface the fault and recover quickly."
      };
    case "idle":
    default:
      return {
        type: "idle",
        badge: "Idle",
        title: "A stage, not a chat window",
        detail:
          "Cadence should feel present before it becomes elaborate. An orb is enough until animation has something real to respond to."
      };
  }
}
