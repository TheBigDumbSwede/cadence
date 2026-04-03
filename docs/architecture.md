# Cadence Architecture

## Product posture

Cadence is not being framed as a desktop chat app with a microphone button glued on. The primary interaction is spoken turn-taking, so the architecture should treat latency and interruption as product features.

## Runtime slices

### 1. Audio pipeline

Responsibilities:

- microphone capture
- voice activity detection
- interruption / barge-in
- playback cancellation

The audio pipeline must be able to preempt downstream work. If the user speaks while TTS is playing, the assistant should stop speaking first and reason about cleanup second.

### 2. Conversation engine

Responsibilities:

- hold turn history
- build prompts
- call the model layer
- decide whether a response should be spoken, shown, or both

This should remain independent of any avatar or animation code.

### 3. Transport layer

Responsibilities:

- manage the live provider session
- translate provider-native events into internal `CadenceEvent` messages
- keep provider session objects and event names away from the rest of the app

The prototype transport can be OpenAI Realtime without making the application OpenAI-shaped.

The current scaffold uses two transports:

- `OpenAI Realtime` for voice mode
- `OpenAI Responses` for text-only mode

That split is deliberate. Most development work does not need audio pricing.

### 4. Speech pipeline

Responsibilities:

- convert assistant text into audio
- stream audio back as early as possible
- expose timing signals for UI and future lip-sync hooks

The speech layer should expose events, not UI decisions.

### 5. Presence layer

Responsibilities:

- reflect assistant state visually
- animate according to state and audio energy
- remain disposable while the core loop evolves

This is where a simple orb can later become a 2D or 3D avatar without rewriting the conversation system.

## State model

The scaffold already centers the following states:

- `idle`
- `listening`
- `transcribing`
- `thinking`
- `speaking`
- `error`

That list is deliberately small. If more states appear later, they should solve real ambiguity rather than decorate the UI.

## Performance rules

- show the window only when ready to paint
- keep the renderer light and avoid oversized component kits
- narrow the preload bridge; do not tunnel the world through IPC
- keep provider adapters behind a transport contract rather than leaking provider session objects into UI state
- keep a cheaper text-only mode available so prompt and UI iteration do not depend on audio transport
- stream model and speech work instead of waiting for whole responses
- measure `time to listening`, `time to first transcript`, and `time to first spoken audio`
- treat interruption handling as a first-class code path, not an edge case

## Recommended next implementation order

1. microphone capture with a push-to-talk control path
2. preserve conversation continuity when switching between Realtime voice mode and Responses text-only mode
3. partial transcription feedback
4. model call with short conversation memory or embedded live transport reasoning
5. optional dedicated ElevenLabs speech adapter if the default voice proves insufficient
6. interruption semantics across audio, inference, and playback
7. richer presence rendering once the turn loop feels fast
