import { CadenceSession } from "./CadenceSession";
import { RendererSpeechOutputAdapter } from "./audio/RendererSpeechOutputAdapter";
import type { TransportConfig } from "./contracts";
import { KindroidIpcTransport } from "./transports/kindroid/KindroidIpcTransport";
import { KindroidVoiceIpcTransport } from "./transports/kindroid/KindroidVoiceIpcTransport";
import { OpenAIRealtimeIpcTransport } from "./transports/openai/OpenAIRealtimeIpcTransport";
import { OpenAIResponsesIpcTransport } from "./transports/openai/OpenAIResponsesIpcTransport";

export const defaultVoiceTransportConfig: TransportConfig = {
  model: "gpt-realtime-mini",
  voice: "alloy",
  instructions:
    "You are Cadence, a concise desktop voice companion optimized for smooth turn-taking.",
  modalities: ["audio"]
};

export const defaultTextTransportConfig: TransportConfig = {
  model: "gpt-5-mini",
  voice: "none",
  instructions:
    "You are Cadence, a concise desktop companion. Keep answers clear and fairly short unless asked for more detail.",
  modalities: ["text"]
};

export const defaultKindroidVoiceTransportConfig: TransportConfig = {
  model: "kindroid+openai+elevenlabs",
  voice: "",
  instructions:
    "You are Cadence speaking on behalf of the configured Kindroid. Preserve the character response but keep the spoken delivery clean and direct.",
  modalities: ["audio"]
};

export const defaultKindroidVoiceOpenAiTtsConfig: TransportConfig = {
  ...defaultKindroidVoiceTransportConfig,
  model: "kindroid+openai+openai-tts"
};

export const defaultKindroidVoiceTextOnlyConfig: TransportConfig = {
  ...defaultKindroidVoiceTransportConfig,
  model: "kindroid+openai+text-only",
  modalities: ["text"]
};

export function createVoiceSession(): CadenceSession {
  return new CadenceSession({
    transport: new OpenAIRealtimeIpcTransport(),
    speechOutputAdapter: new RendererSpeechOutputAdapter()
  });
}

export function createKindroidVoiceSession(): CadenceSession {
  return new CadenceSession({
    transport: new KindroidVoiceIpcTransport(),
    speechOutputAdapter: new RendererSpeechOutputAdapter()
  });
}

export function createTextSession(): CadenceSession {
  return new CadenceSession({
    transport: new OpenAIResponsesIpcTransport()
  });
}

export function createKindroidSession(): CadenceSession {
  return new CadenceSession({
    transport: new KindroidIpcTransport()
  });
}

export const voiceStackNotes = [
  {
    title: "Default prototype path",
    body: "Use OpenAI Realtime Mini as the first live transport so the turn loop is cheap and low-latency."
  },
  {
    title: "Cheap dev mode",
    body: "Text-only mode routes through the Responses API on gpt-5-mini so ordinary iteration does not burn audio tokens."
  },
  {
    title: "Kindroid voice path",
    body: "Kindroid Voice composes OpenAI transcription, Kindroid text replies, and a selectable TTS layer without disturbing OpenAI Realtime."
  },
  {
    title: "Swap path later",
    body: "Keep transcript and speech behind adapters so ElevenLabs can replace output voice without forcing a UI rewrite."
  }
];
