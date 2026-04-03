export type SessionStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "disconnected";

export type AudioFormat = "pcm16" | "wav" | "mp3";

export type CadenceEvent =
  | {
      type: "session.status";
      provider: string;
      status: SessionStatus;
    }
  | {
      type: "transcript.partial";
      turnId: string;
      text: string;
    }
  | {
      type: "transcript.final";
      turnId: string;
      text: string;
    }
  | {
      type: "assistant.response.delta";
      turnId: string;
      text: string;
    }
  | {
      type: "assistant.response.completed";
      turnId: string;
      text: string;
    }
  | {
      type: "assistant.audio.chunk";
      turnId: string;
      sequence: number;
      format: AudioFormat;
      data: ArrayBuffer;
    }
  | {
      type: "assistant.interrupted";
      reason: "user_barge_in" | "operator_stop" | "transport_reset";
    }
  | {
      type: "transport.error";
      provider: string;
      message: string;
      recoverable: boolean;
    };
