# Cadence

Cadence is an experimental desktop companion app built around fast turn-taking, persistent presence, and swappable backend paths.

It is not a generic chat client with voice bolted on. The main idea is that conversation, stage presence, and speech/text modes should still feel like one product.

## Current State

Cadence is public-prototype quality:

- coherent enough to use and inspect
- interesting enough to share
- still rough around orchestration, timing, and polish
- now broad enough to call a real `0.2.0` prototype checkpoint

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

### Stage

- `Waveform`

## Why It Exists

Cadence is exploring a few specific ideas:

- a companion surface instead of a dashboard
- low-latency voice interaction without locking the whole app to one provider
- a persistent waveform stage tied to real conversational state
- persistent local settings instead of forcing `.env` for normal use
- multi-character Kindroid scenes without turning the app into a Kin management panel
- narration-aware staging, including optional Foley-style scene accents

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
- `src/services/stage/`
  stage-facing presence heuristics

## Settings

Cadence now prefers profile-backed settings stored through the app itself.

That includes:

- API keys
- Kindroid participant rosters and active selection
- mirrored Kindroid group ids and local group membership
- OpenAI batch TTS voice instructions
- Kindroid new-chat greeting
- selected voice mode/backend
- TTS voice settings

`.env` still works as a fallback for development, but it is no longer the preferred runtime path.

## Kindroid Boundaries

Cadence keeps Kindroid integration in two layers:

- official
  documented messaging endpoints used by the normal app path
- experimental
  undocumented endpoints isolated from the stable messaging path

That split is intentional. If Kindroid changes undocumented behavior, experimental support should be removable without disturbing the main conversation path.

Experimental capabilities are grouped by responsibility:

- `account`
  subscription and account-state helpers
- `profile`
  user persona/profile updates
- `kin`
  Kin creation, Kin updates, and journal entry writes
- `media`
  selfie and group selfie requests
- `groupChats`
  group chat creation, mutation, and turn orchestration
- `suggestions`
  suggested user-message helpers

## Kindroid Group Notes

Cadence currently treats Kindroid group conversations as a local mirror:

- create and manage the actual group inside Kindroid
- mirror the `group_id` and exact participant roster locally in Cadence
- choose `solo` or `group` mode from the Kindroid UI

Cadence does not try to own Kindroid group creation. That is deliberate.

Each local Kindroid participant can carry its own:

- bubble/display name
- text-only or speech output path
- OpenAI or ElevenLabs voice settings
- narration filtering rules for speech
- waveform color and accent theme
- narration Foley preferences for stage/sound treatment

Automatic Kindroid groups can chain multiple Kin replies until Kindroid yields the turn back to the user. Manual groups let the user choose the next Kin directly from the in-chat roster buttons.

## Narration Foley Notes

Cadence can now treat narrated Kindroid prose as a light staging layer rather than dead text.

Current behavior:

- narration beat analysis uses a fast OpenAI text model to extract up to 3 short audible beats
- those beats can appear as a top-stage Foley caption during playback
- if ElevenLabs sound effects are available and narration FX is enabled, Cadence can synthesize those beats as a stitched pre-speech Foley prelude
- if ElevenLabs is unavailable or narration FX is disabled, the visual Foley caption still appears without delaying spoken captions

This is intentionally prototype territory. It is meant to add atmosphere, not become a full sound-design engine.

Waveform mode is not a fallback. It is a first-class stage path:

- audio-driven when speech is actually playing
- procedural and ambient when it is not

When Kindroid is active, the waveform stage can also pick up per-participant visual themes so different characters read differently at a glance.

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

- `release/Cadence-0.2.2-portable.exe`

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
- no claim of production hardening or broad platform support yet

## Repo Hygiene

Local-only files that should stay untracked include:

- `.env`
- `.env.local`
- profile settings files under Electron user data
- build outputs under `dist/`, `dist-electron/`, and `release/`

## Suggested Framing

If you share the project, the honest framing is:

- experimental desktop companion
- voice/text presence prototype
- OpenAI + Kindroid backend exploration
- waveform stage and conversational orchestration experiments

That is strong enough. It does not need fake maturity language.
