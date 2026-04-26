import { CadenceSession } from "./CadenceSession";
import { RendererSpeechOutputAdapter } from "./audio/RendererSpeechOutputAdapter";
import type { TransportConfig } from "./contracts";
import { KindroidGroupIpcTransport } from "./transports/kindroid/KindroidGroupIpcTransport";
import { KindroidGroupVoiceIpcTransport } from "./transports/kindroid/KindroidGroupVoiceIpcTransport";
import { KindroidIpcTransport } from "./transports/kindroid/KindroidIpcTransport";
import { KindroidVoiceIpcTransport } from "./transports/kindroid/KindroidVoiceIpcTransport";
import { OpenAIBatchVoiceIpcTransport } from "./transports/openai/OpenAIBatchVoiceIpcTransport";
import { OpenAIRealtimeIpcTransport } from "./transports/openai/OpenAIRealtimeIpcTransport";
import { OpenAIResponsesIpcTransport } from "./transports/openai/OpenAIResponsesIpcTransport";

export const defaultVoiceTransportConfig: TransportConfig = {
  model: "gpt-realtime-1.5",
  voice: "alloy",
  instructions:
    "You are Cadence, a concise desktop voice companion optimized for smooth turn-taking.",
  modalities: ["audio"]
};

export const defaultTextTransportConfig: TransportConfig = {
  model: "gpt-5.4-mini",
  voice: "none",
  instructions:
    "You are Cadence, a concise desktop companion. Keep answers clear and fairly short unless asked for more detail.",
  modalities: ["text"]
};

export const defaultOpenAiBatchVoiceTransportConfig: TransportConfig = {
  model: "gpt-5.4-mini+elevenlabs",
  voice: "",
  instructions:
    "You are Cadence, a concise desktop voice companion. Keep answers clear and fairly short unless asked for more detail.",
  modalities: ["audio"]
};

export const defaultOpenAiBatchVoiceOpenAiTtsConfig: TransportConfig = {
  ...defaultOpenAiBatchVoiceTransportConfig,
  model: "gpt-5.4-mini+openai-tts"
};

export const defaultOpenAiBatchVoiceTextOnlyConfig: TransportConfig = {
  ...defaultOpenAiBatchVoiceTransportConfig,
  model: "gpt-5.4-mini+text-only",
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

export function createKindroidGroupVoiceSession(): CadenceSession {
  return new CadenceSession({
    transport: new KindroidGroupVoiceIpcTransport(),
    speechOutputAdapter: new RendererSpeechOutputAdapter()
  });
}

export function createOpenAiBatchVoiceSession(): CadenceSession {
  return new CadenceSession({
    transport: new OpenAIBatchVoiceIpcTransport(),
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

export function createKindroidGroupSession(): CadenceSession {
  return new CadenceSession({
    transport: new KindroidGroupIpcTransport()
  });
}

export const voiceStackNotes = [
  {
    title: "Default prototype path",
    body: "Use gpt-realtime-1.5 as the first live transport for the highest-quality native voice loop."
  },
  {
    title: "Cheap dev mode",
    body: "Text-only mode routes through the Responses API on gpt-5.4-mini so ordinary iteration does not burn audio tokens."
  },
  {
    title: "OpenAI chained voice path",
    body: "OpenAI Voice composes OpenAI transcription, the Responses API, and a selectable output layer when you want simpler non-realtime voice behavior."
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
