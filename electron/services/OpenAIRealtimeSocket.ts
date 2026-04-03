import "dotenv/config";

import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { BrowserWindow } from "electron";
import type { TransportConfig } from "../../src/services/contracts";
import type { CadenceEvent } from "../../src/shared/voice-events";
import { getSettingsService } from "./SettingsService";

const DEFAULT_CONFIG: TransportConfig = {
  model: "gpt-realtime-mini",
  voice: "alloy",
  instructions:
    "You are Cadence, a concise desktop voice companion optimized for smooth turn-taking.",
  modalities: ["audio"]
};

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

export class OpenAIRealtimeSocket {
  private socket: WebSocket | null = null;
  private config: TransportConfig = DEFAULT_CONFIG;
  private currentResponseId: string | null = null;
  private audioSequenceByTurn = new Map<string, number>();

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  isConfigured(): boolean {
    return Boolean(getSettingsService().getOpenAiApiKey());
  }

  getState(): {
    connected: boolean;
    configured: boolean;
    apiKeyPresent: boolean;
    model: string | null;
  } {
    return {
      connected: this.socket?.readyState === WebSocket.OPEN,
      apiKeyPresent: this.isConfigured(),
      configured: this.isConfigured(),
      model: this.config.model
    };
  }

  async connect(config?: Partial<TransportConfig>): Promise<void> {
    if (!this.isConfigured()) {
      this.emit({
        type: "transport.error",
        provider: "openai-realtime",
        message: "OPENAI_API_KEY is not configured.",
        recoverable: false
      });
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };

    this.emit({
      type: "session.status",
      provider: "openai-realtime",
      status: "connecting"
    });

    await new Promise<void>((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.model)}`;
      const apiKey = getSettingsService().getOpenAiApiKey();
      const socket = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });

      const handleError = (error: Error) => {
        this.emit({
          type: "transport.error",
          provider: "openai-realtime",
          message: error.message,
          recoverable: true
        });
        reject(error);
      };

      socket.once("open", () => {
        this.socket = socket;
        this.installSocketHandlers(socket);
        this.send({
          type: "session.update",
          session: {
            type: "realtime",
            instructions: this.config.instructions,
            output_modalities: this.config.modalities,
            audio: {
              input: {
                format: {
                  type: "audio/pcm",
                  rate: 24000
                },
                transcription: {
                  model: "gpt-4o-mini-transcribe"
                },
                turn_detection: null
              },
              output: {
                format: {
                  type: "audio/pcm",
                  rate: 24000
                },
                voice: this.config.voice
              }
            }
          }
        });
        resolve();
      });

      socket.once("error", handleError);
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket) {
      return;
    }

    await new Promise<void>((resolve) => {
      const socket = this.socket;
      this.socket = null;
      socket.once("close", () => {
        this.emit({
          type: "session.status",
          provider: "openai-realtime",
          status: "disconnected"
        });
        resolve();
      });
      socket.close();
    });
  }

  async sendUserText(text: string): Promise<void> {
    if (!text.trim()) {
      return;
    }

    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text
          }
        ]
      }
    });

    this.emit({
      type: "transcript.final",
      turnId: randomUUID(),
      text
    });

    this.sendCreateResponse();
  }

  async sendUserAudio(audio: ArrayBuffer): Promise<void> {
    this.send({ type: "input_audio_buffer.clear" });
    this.send({
      type: "input_audio_buffer.append",
      audio: toBase64(audio)
    });
    this.send({
      type: "input_audio_buffer.commit"
    });
    this.sendCreateResponse();
  }

  async interruptAssistant(
    reason: "user_barge_in" | "operator_stop" = "operator_stop"
  ): Promise<void> {
    this.send({ type: "response.cancel" });
    this.emit({
      type: "assistant.interrupted",
      reason
    });
  }

  private sendCreateResponse(): void {
    this.emit({
      type: "session.status",
      provider: "openai-realtime",
      status: "thinking"
    });

    this.send({
      type: "response.create",
      response: {
        output_modalities: this.config.modalities,
        audio: {
          output: {
            format: {
              type: "audio/pcm",
              rate: 24000
            },
            voice: this.config.voice
          }
        }
      }
    });
  }

  private installSocketHandlers(socket: WebSocket): void {
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      this.handleServerEvent(message);
    });

    socket.on("close", () => {
      this.socket = null;
      this.emit({
        type: "session.status",
        provider: "openai-realtime",
        status: "disconnected"
      });
    });

    socket.on("error", (error) => {
      this.emit({
        type: "transport.error",
        provider: "openai-realtime",
        message: error.message,
        recoverable: true
      });
    });
  }

  private handleServerEvent(event: Record<string, unknown>): void {
    const type = typeof event.type === "string" ? event.type : "";

    switch (type) {
      case "session.created":
      case "session.updated":
        this.emit({
          type: "session.status",
          provider: "openai-realtime",
          status: "ready"
        });
        return;
      case "input_audio_buffer.committed":
        this.emit({
          type: "session.status",
          provider: "openai-realtime",
          status: "thinking"
        });
        return;
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = this.readNestedString(event, ["transcript"]);
        const itemId = this.readNestedString(event, ["item_id"]) ?? randomUUID();
        if (transcript) {
          this.emit({
            type: "transcript.final",
            turnId: itemId,
            text: transcript
          });
        }
        return;
      }
      case "response.created":
        this.currentResponseId =
          this.readNestedString(event, ["response", "id"]) ?? randomUUID();
        this.audioSequenceByTurn.set(this.currentResponseId, 0);
        this.emit({
          type: "session.status",
          provider: "openai-realtime",
          status: "thinking"
        });
        return;
      case "response.output_audio.delta":
      case "response.audio.delta": {
        const turnId = this.getResponseTurnId(event);
        const base64 = this.readNestedString(event, ["delta"]);
        if (!base64) {
          return;
        }

        const data = Buffer.from(base64, "base64");
        const sequence = this.audioSequenceByTurn.get(turnId) ?? 0;
        this.audioSequenceByTurn.set(turnId, sequence + 1);
        this.emit({
          type: "session.status",
          provider: "openai-realtime",
          status: "speaking"
        });
        this.emit({
          type: "assistant.audio.chunk",
          turnId,
          sequence,
          format: "pcm16",
          data: data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          )
        });
        return;
      }
      case "response.output_audio_transcript.delta":
      case "response.output_text.delta": {
        const delta = this.readNestedString(event, ["delta"]);
        if (!delta) {
          return;
        }

        this.emit({
          type: "assistant.response.delta",
          turnId: this.getResponseTurnId(event),
          text: delta
        });
        return;
      }
      case "response.output_audio_transcript.done":
      case "response.output_text.done": {
        const text =
          this.readNestedString(event, ["transcript"]) ??
          this.readNestedString(event, ["text"]) ??
          "";

        this.emit({
          type: "assistant.response.completed",
          turnId: this.getResponseTurnId(event),
          text
        });
        return;
      }
      case "response.done":
        this.emit({
          type: "session.status",
          provider: "openai-realtime",
          status: "ready"
        });
        return;
      case "error":
        this.emit({
          type: "transport.error",
          provider: "openai-realtime",
          message:
            this.readNestedString(event, ["error", "message"]) ??
            "Realtime transport error.",
          recoverable: true
        });
        return;
      default:
        return;
    }
  }

  private getResponseTurnId(event: Record<string, unknown>): string {
    return (
      this.readNestedString(event, ["response_id"]) ??
      this.readNestedString(event, ["response", "id"]) ??
      this.currentResponseId ??
      randomUUID()
    );
  }

  private readNestedString(
    value: Record<string, unknown>,
    path: string[]
  ): string | null {
    let current: unknown = value;

    for (const key of path) {
      if (!current || typeof current !== "object" || !(key in current)) {
        return null;
      }

      current = (current as Record<string, unknown>)[key];
    }

    return typeof current === "string" ? current : null;
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime socket is not connected.");
    }

    this.socket.send(JSON.stringify(payload));
  }

  private emit(event: CadenceEvent): void {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    window.webContents.send("realtime:event", event);
  }
}
