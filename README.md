# Cadence

Cadence is a voice-first desktop companion project inside `vibe`, aimed at fast turn-taking rather than generic chat-window behavior.

## Principles

- Time to listening matters as much as model quality.
- The assistant should expose explicit interaction states: `idle`, `listening`, `transcribing`, `thinking`, `speaking`, `error`.
- Presence is a presentation concern. Avatar work should subscribe to state, not own conversation logic.
- Voice and text paths should share session structure without forcing a single provider.
- Development should have a cheaper text-only path, so ordinary iteration does not require audio-priced traffic.

## Stack

- Electron for the desktop shell and media-friendly runtime
- Vite + React + TypeScript for a lean renderer
- Esbuild for a small Electron main/preload build step

## Current Modes

- OpenAI Realtime voice mode
- OpenAI text-only mode
- Kindroid text mode
- Kindroid voice mode with OpenAI transcription and selectable output:
  - ElevenLabs voice
  - OpenAI voice
  - text reply only

## Project Layout

```text
cadence/
├─ docs/
│  └─ architecture.md
├─ electron/
│  ├─ ipc/
│  │  └─ app.ts
│  ├─ main.ts
│  └─ preload.ts
├─ public/
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ hooks/
│  ├─ services/
│  └─ shared/
├─ .env.example
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## Getting Started

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm run dev`.
4. Add a local `.env` with whichever provider keys you want to use.

## Environment

- `OPENAI_API_KEY` enables OpenAI Realtime voice mode, OpenAI text mode, and OpenAI transcription for Kindroid Voice.
- `OPENAI_TTS_VOICE` optionally selects the OpenAI speech voice for Kindroid Voice when OpenAI TTS is active.
- `ELEVENLABS_API_KEY` plus `ELEVENLABS_VOICE_ID` enable ElevenLabs speech output for Kindroid Voice.
- `KINDROID_API_KEY` plus `KINDROID_AI_ID` enable Kindroid text mode.
- `KINDROID_BASE_URL` defaults to `https://api.kindroid.ai/v1`.

## Next Build Steps

1. Replace the abstract stage with a real avatar/presence layer.
2. Tighten interruption and streaming behavior for the composed Kindroid voice path.
3. Add richer provider settings in-app instead of relying on `.env` only.
4. Improve transcript quality-of-life: message grouping, timestamps, and persistence.
5. Add packaging and release setup for Windows builds.

The current app is no longer just a scaffold. The main remaining work is product refinement, packaging, and deeper conversation behavior.
