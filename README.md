# Cadence

Cadence is an experimental desktop companion app built around fast turn-taking, persistent presence, and swappable backend paths.

It is not a generic chat client with voice bolted on. The main idea is that conversation, stage presence, and speech/text modes should still feel like one product.

## Current State

Cadence is public-prototype quality:
- coherent enough to use and inspect
- interesting enough to share
- still rough around orchestration, timing, and polish

It is not pretending to be finished software.

## License Status

This repository is currently public for visibility and collaboration, but it does **not** yet include an open-source license.

Until a license is added, treat the code as:
- source-available for reading
- not granted for reuse, redistribution, or commercial resale

That may change later, but it is not the posture today.

## What It Does

### Interaction modes

- `Voice`
- `Text-only`

### Voice backends

- `OpenAI Realtime`
- `OpenAI Voice`
  OpenAI STT -> OpenAI Responses -> selectable output layer
- `Kindroid Voice`
  OpenAI STT -> Kindroid -> selectable output layer

### Text backends

- `OpenAI`
- `Kindroid`

### Output layers for non-realtime voice

- `Text Reply`
- `OpenAI Voice`
- `ElevenLabs Voice`

### Stage modes

- `Waveform`
- `Avatar`

The default stage for a brand-new profile is `Waveform`.

## Why It Exists

Cadence is exploring a few specific ideas:
- a companion surface instead of a dashboard
- low-latency voice interaction without locking the whole app to one provider
- a stage layer that can be either stylized waveform or VRM avatar
- persistent local settings instead of forcing `.env` for normal use

## Architecture Notes

The important boundary is:
- Cadence owns interaction, presence, and local UX
- backends own reasoning, speech generation, or external integrations

That means Cadence should stay the conversational shell, not become a giant integration blob.

### Current shape

- `electron/`
  main-process services, IPC, settings persistence
- `src/services/transports/`
  backend-specific transport/session wiring
- `src/hooks/useCadenceController.ts`
  current orchestration root
- `src/components/`
  UI and stage renderers
- `src/services/audio/`
  capture, playback, waveform analysis
- `src/services/avatar/`
  performance heuristics and stage motion support

## Settings

Cadence now prefers profile-backed settings stored through the app itself.

That includes:
- API keys
- AI IDs
- selected stage mode
- selected voice mode/backend
- TTS voice settings
- avatar selection

`.env` still works as a fallback for development, but it is no longer the preferred runtime path.

## VRM / Stage Notes

Avatar mode currently supports:
- local `.vrm` import
- authored `.vrma` loop states for idle/listening/thinking
- procedural speaking behavior layered on top

Waveform mode is not a fallback. It is a first-class stage path:
- audio-driven when speech is actually playing
- procedural and ambient when it is not

## Getting Started

### Requirements

- Node.js 20+
- Windows is the primary packaged target right now

### Development

```powershell
npm install
npm run dev
```

Then open `Settings` inside the app and enter whichever provider credentials you want to use.

### Optional `.env` fallback

If you prefer local env-based development, see [`./.env.example`](./.env.example).

## Packaging

### Windows portable build

```powershell
npm run dist:win
```

Output:
- `release/Cadence-0.1.0-portable.exe`

### Unpacked directory build

```powershell
npm run dist:dir
```

## Icon Pipeline

The Windows icon is generated from repo assets instead of being an opaque manual binary.

Files:
- [`build/icon.svg`](./build/icon.svg)
- [`build/icon.png`](./build/icon.png)
- [`build/icon.ico`](./build/icon.ico)
- [`scripts/generate_icon.py`](./scripts/generate_icon.py)

Regenerate:

```powershell
npm run build:icon
```

## Known Rough Edges

- `src/hooks/useCadenceController.ts` is still the main orchestration pressure point
- turn timing and stage timing are good enough, not fully elegant
- hot mic is useful, but still prototype-tuned
- avatar animation is intentionally restrained and not yet a full animation system
- no claim of production hardening or broad platform support yet

## Repo Hygiene

Local-only files that should stay untracked include:
- `.env`
- `.env.local`
- profile settings files under Electron user data
- imported local avatar files under `assets/avatars/`
- build outputs under `dist/`, `dist-electron/`, and `release/`

## Suggested Framing

If you share the project, the honest framing is:
- experimental desktop companion
- voice/text presence prototype
- OpenAI + Kindroid backend exploration
- waveform and VRM stage experiments

That is strong enough. It does not need fake maturity language.
