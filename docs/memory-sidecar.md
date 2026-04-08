# Memory Sidecar

Cadence can talk to a local sidecar backend for shared long-term memory across the native OpenAI paths.

## Current Shape

- local HTTP/JSON service
- file-backed storage at `tmp/memory-sidecar-store.json` by default
- heuristic memory extraction for obvious user preferences and stable facts
- simple overlap-based recall that returns a compact `contextBlock`

This is intentionally a first-step backend, not a finished memory engine.

## Endpoints

- `GET /v1/health`
- `POST /v1/memory/recall`
- `POST /v1/memory/ingest`
- `POST /v1/memory/session/close`

## Running

1. Build it:
   `npm run build:memory-sidecar`
2. Start it:
   `npm run start:memory-sidecar`
3. In Cadence Settings, set `Memory backend URL` to:
   `http://127.0.0.1:8787`

## Environment

- `CADENCE_MEMORY_PORT`
  default: `8787`
- `CADENCE_MEMORY_STORE_PATH`
  optional explicit path for the sidecar JSON store

## Notes

- The sidecar is shared by `openai-realtime`, `openai-responses`, and `openai-batch`.
- Cadence remains the conversational shell; the sidecar owns memory extraction, storage, and recall.
- The current storage and ranking logic are deliberately plain so the API boundary can be exercised before committing to a more capable retrieval backend.
