# Memory Sidecar

Cadence can talk to a local sidecar backend for shared long-term memory across the native OpenAI paths.

## Current Shape

- local HTTP/JSON service
- file-backed storage at `tmp/memory-sidecar-store.json` by default
- heuristic memory extraction for preferences, stable facts, project context, and open threads
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

If Cadence is running with a localhost memory URL and the bundled sidecar build is present, Electron also attempts to start the local sidecar automatically.

For normal development, `npm run dev` now starts the sidecar runtime as part of the dev stack and waits for port `8787` before launching Electron.

## Environment

- `CADENCE_MEMORY_PORT`
  default: `8787`
- `CADENCE_MEMORY_STORE_PATH`
  optional explicit path for the sidecar JSON store

## Notes

- The sidecar is shared by `openai-realtime`, `openai-responses`, and `openai-batch`.
- Cadence remains the conversational shell; the sidecar owns memory extraction, storage, and recall.
- The current extractor is still heuristic, but it no longer writes broad rolling session summaries by default.
