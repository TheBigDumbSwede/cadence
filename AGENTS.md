# Cadence Agent Notes

This file is the repo-local context layer for `cadence/`. It should capture the project's actual operating shape, not an aspirational redesign.

## What Cadence Is

Cadence is a desktop companion app, not a generic chat shell.

The product center is:
- fast conversational turn-taking
- a persistent stage/presence layer
- interchangeable backend paths behind one coherent UI

The app should feel like one product across:
- voice
- text-only
- avatar stage
- waveform stage

Do not let it drift into:
- a generic dashboard
- a pile of unrelated integrations
- a chat client with decorative voice features

## Architectural Boundaries

The important boundary is:
- Cadence owns interaction, presence, and approvals
- backends own reasoning/speech/device capabilities

Cadence should be the conversational shell, not the implementation home for every integration.

Current major layers:
- `electron/`
  main-process providers, IPC, settings persistence
- `src/services/transports/`
  provider-specific transport/session wiring
- `src/hooks/useCadenceController.ts`
  main orchestration root
- `src/components/`
  UI and stage renderers
- `src/services/audio/`
  capture/playback/waveform plumbing
- `src/services/avatar/`
  performance heuristics and motion support
- `src/shared/`
  shared contracts and settings types

## Current Voice/Text Paths

### Voice backends

- `openai`
  OpenAI Realtime
- `openai-batch`
  OpenAI STT -> OpenAI Responses -> selectable output layer
- `kindroid`
  OpenAI STT -> Kindroid -> selectable output layer

### Output layers for non-realtime voice

- `none`
  text reply only
- `openai`
  OpenAI TTS
- `elevenlabs`
  ElevenLabs TTS

### Text backends

- `openai`
- `kindroid`

Important rule:
- OpenAI Realtime is its own native path
- Kindroid and OpenAI batch voice are composed paths
- do not try to pretend Realtime is a generic wrapper for third-party reasoning

## Kindroid Conversation Notes

Kindroid is no longer just a single `ai_id` path.

Current working model:
- solo Kindroid uses a participant roster
- group Kindroid uses a local mirror of an already-existing Kindroid group
- Cadence stores the local participant metadata needed for:
  - `ai_id` routing
  - bubble naming
  - per-participant speech routing
  - narration filtering for TTS
  - waveform color/accent theming
  - narration Foley preferences for visual/audio staging

Keep the boundary sharp:
- Kindroid remains the source of truth for actual group existence and turn logic
- Cadence owns the local mirror, orchestration, and presentation
- do not bloat Cadence into a full Kindroid management surface

Narration staging rule:
- narration analysis and narration playback are separate concerns
- visual Foley cues may still appear even when ElevenLabs sound-effect playback is unavailable or disabled
- spoken-caption timing must not be delayed unless real pre-speech Foley audio is actually present

## Stage Modes

Cadence has two stage modes:
- `avatar`
- `waveform`

### Default

For a brand-new profile, the default stage is:
- `waveform`

Existing saved preferences still win over defaults.

### Avatar mode

- uses imported local `.vrm` files
- supports authored `.vrma` loop states
- current authored loop files live in `assets/animations/`
- speaking remains mostly procedural

Current clip-backed loop states:
- `idle`
- `listening`
- `thinking` / `transcribing`

Do not overcomplicate avatar animation prematurely. Keep:
- loop states clip-backed
- speaking responsive/procedural

### Waveform mode

- is a real peer to avatar mode, not a fallback
- speaking should be driven by actual output audio samples when available
- non-speaking states use procedural motion
- there is a short speaking pre-roll to bridge the gap before real output samples arrive
- Kindroid can tint the waveform per participant; that theming should follow the actually audible speaker, not the next queued turn
- stage overlays may include a short-lived Foley caption above the spoken caption; keep it subordinate and lightweight

Do not reintroduce avatar-specific timing hacks into the waveform path.

## Settings and Persistence

Settings are profile-backed in the Electron main process:
- non-secret values in the app profile settings store
- secrets stored via Electron safe storage when available
- `.env` is fallback/dev convenience, not the preferred runtime source

Key file:
- `electron/services/SettingsService.ts`

Settings precedence should remain:
1. saved app settings
2. `.env`
3. built-in default

Do not move secrets into renderer storage.

## UI Principles

The UI has already been trimmed repeatedly. Protect that.

Main window should show:
- content
- controls
- presence

Main window should not show:
- duplicated runtime metadata
- repeated status posture in multiple places
- explanatory chrome that narrates the app to the user

Runtime metadata belongs in:
- `System`

Mode/backend/configuration choices belong in:
- `Settings`

If adding a label or chip, ask whether it changes a user decision. If not, it probably does not belong in the main shell.

## Known Pressure Point

The main code hotspot is:
- `src/hooks/useCadenceController.ts`

It is still the orchestration root and intentionally so, but it has accumulated multiple responsibilities:
- session lifecycle
- voice input flow
- turn reconciliation
- presence/stage timing
- settings refresh
- status copy

Recent cleanup extracted pure helpers into:
- `src/hooks/cadence/timing.ts`
- `src/hooks/cadence/performance.ts`
- `src/hooks/cadence/turns.ts`
- `src/hooks/cadence/statusCopy.ts`

That was a first-level cleanup, not a full decomposition.

If continuing cleanup, split by responsibility, not by file length.

Good next seams:
- input orchestration
- turn reconciliation
- stage/presence orchestration

Avoid:
- premature state-machine overengineering
- reducer-abstraction for its own sake
- “modularity” that just moves complexity without clarifying it

## Voice Input Notes

Cadence supports:
- push-to-talk
- hot mic

Hot mic is additional functionality, not a replacement for push-to-talk.

Current behavior:
- hot mic can be paused without leaving the mode
- hot mic suppresses while Cadence is speaking
- initial trigger timing has been tuned to feel quicker after unmute

If changing hot mic behavior, preserve:
- immediate manual mute/unmute
- predictable suppression during assistant playback
- conservative false-trigger behavior

## Transcript Ordering

There is explicit logic for audio-turn ordering.

Important behavior:
- pending audio user turns are tracked internally
- assistant output can be buffered until transcript-final arrives
- avoid rendering fake placeholder bubbles unless the user explicitly wants that

If touching this area, do not “fix” ordering with superficial sorting hacks. The order is a turn lifecycle problem, not just a rendering problem.

## OpenAI Speech / STT Notes

Current STT path uses:
- `gpt-4o-transcribe`

It is explicitly biased toward English transcription to avoid spurious transliteration/translation behavior for English speech.

OpenAI TTS voice selection is now a dropdown in Settings with supported voice values rather than a freeform textbox.

If extending voice options, preserve the current split:
- backend choice controls reasoning path
- output layer choice controls speech path

## Packaging

Windows packaging is already wired:
- `npm run dist:win`

Current packaging notes:
- Windows portable build output goes to `release/`
- app icon is now custom and generated from repo assets

Icon pipeline:
- source concept: `build/icon.svg`
- generated assets:
  - `build/icon.png`
  - `build/icon.ico`
- generator:
  - `scripts/generate_icon.py`
- command:
  - `npm run build:icon`

If changing the icon, update the generator or source asset rather than dropping in opaque binaries with no provenance.

## Practical Rules for Future Work

- Preserve the distinction between presence logic and conversation logic.
- Prefer small, coherent extractions over sweeping rewrites.
- Do not expand the main window with low-value status chrome.
- Keep waveform and avatar as equal stage modes.
- Keep new defaults low-drama and profile-safe; do not clobber saved user settings.
- When behavior differs by stage mode, make that explicit instead of smuggling avatar assumptions into waveform.
- When behavior differs by voice backend, keep the split in transports/config, not scattered through UI.

## What "Good" Looks Like Here

Good changes in this repo usually have these qualities:
- they preserve the product center
- they reduce visual noise
- they keep the backend composition honest
- they avoid fake abstraction
- they improve local reasoning without forcing a rewrite

If a change makes Cadence feel more like an orchestration/control panel and less like a companion surface, be suspicious.
