# Gemini TTS — Backend Reference

Quick reference for how `server.py` talks to the Gemini TTS API and how it chunks long text. Scope is the local Flask server only; nothing here covers the Chrome extension UI.

Note: the shared `/tts-job` pipeline now also supports `provider: "qwen_mlx"` for local Qwen MLX TTS through the sibling `talking-head` repo. Gemini remains the default provider, and the Gemini-specific details below still apply when `provider` is omitted or set to `"gemini"`.

## Model and audio format

- Model: `gemini-3.1-flash-tts-preview` (constant `GEMINI_TTS_MODEL`).
- SDK: `google-genai` (`from google import genai`).
- Auth: `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) from `.env`.
- Gemini returns raw **LINEAR16 PCM** (mono, 24000 Hz, 16‑bit). The server wraps it in a WAV container via `_pcm_to_wav_bytes(...)` before returning it to clients. Gemini TTS does **not** stream — each call returns the full audio for the input text.

## Single low-level call

`generate_gemini_tts_audio(text, voice_name=None)` is the only function that talks to Gemini. It performs one synchronous `generate_content` call:

```python
client = genai.Client(api_key=api_key)
response = client.models.generate_content(
    model=GEMINI_TTS_MODEL,                     # gemini-3.1-flash-tts-preview
    contents=text,
    config=types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice_name or GEMINI_TTS_DEFAULT_VOICE,
                )
            )
        ),
    ),
)
pcm = response.candidates[0].content.parts[0].inline_data.data
return _pcm_to_wav_bytes(pcm)
```

Notes:

- `response_modalities=["AUDIO"]` is required — text-only completions will not return audio.
- `voice_name` must be a Gemini prebuilt voice (default `Kore`; configurable via `GEMINI_TTS_VOICE`).
- The PCM payload is base64 in the SDK response; `_pcm_to_wav_bytes` decodes it if it arrives as a string.

## HTTP endpoints

Two flavors are exposed. Use the job flow for anything longer than a few sentences.

### `POST /tts` — single blocking call

Body:

```json
{ "text": "...", "voiceName": "Kore" }
```

Behavior:

- Trims input to `GEMINI_TTS_MAX_CHARS` (default `15000`); sets `truncated: true` when it cuts.
- Calls `generate_gemini_tts_audio` once with the **entire** truncated text. No chunking.
- Returns `{ audioBase64, mimeType: "audio/wav", model, voiceName, truncated }`.
- Returns `502` on Gemini failure. Use only for short text / smoke tests.

### `POST /tts-job` — async chunked job (recommended)

Body:

```json
{ "text": "...", "voiceName": "Kore" }
```

Flow (`_build_tts_job` → `_run_tts_job`):

1. Truncate to `GEMINI_TTS_MAX_CHARS`.
2. Run the input through `chunk_tts_text` (see below).
3. Persist a job record to `~/.cache/video-extension/tts/<jobId>.json` and respond `202` with the job snapshot.
4. A background thread acquires `TTS_SEMAPHORE` (size = `GEMINI_TTS_CONCURRENCY`), then calls `generate_gemini_tts_audio` once per chunk in order, writing each `<jobId>_chunk_<n>.wav` to the cache dir.
5. After every chunk succeeds, all chunk WAVs are concatenated by raw PCM (`_combine_wav_chunks`) into the final `<jobId>.wav`.

Companion endpoints used to drive playback or recover state:

| Method | Path                                          | Purpose                                                                |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/tts-job/<jobId>`                            | Snapshot: status, progress, chunk timings, error info.                 |
| GET    | `/tts-job/<jobId>/events`                     | SSE stream of the same snapshot, pushed on every state change.         |
| GET    | `/tts-job/<jobId>/chunk/<index>/audio`        | WAV for a single chunk as soon as it is ready (1‑indexed).             |
| GET    | `/tts-job/<jobId>/audio`                      | Full stitched WAV; `409` until `status == "done"`.                     |
| POST   | `/tts-job/<jobId>/retry`                      | Requeue a failed/cancelled job; already generated chunks are reused.   |
| DELETE | `/tts-job/<jobId>`                            | Request cancellation. Status moves to `cancelling` then `cancelled`.   |

Status values: `queued`, `running`, `done`, `error`, `cancelling`, `cancelled` (legacy jobs may still surface `rate_limited`).

Error payload shape (`_tts_error_payload`):

```json
{
  "type": "rate_limited | transient_gemini_error | auth_error | gemini_error",
  "message": "...",
  "retryable": true,
  "retryAfterSeconds": 30.0,
  "chunkIndex": 3
}
```

`429 RESOURCE_EXHAUSTED` is mapped to `type: "rate_limited"` and never auto-retried — the client decides. `5xx` becomes `transient_gemini_error` with `retryable: true`.

## Chunking strategy (`chunk_tts_text`)

Goal: keep each Gemini call comfortably under model limits without slicing through sentences. The algorithm is greedy and runs in three passes:

1. **Normalize.** Collapse runs of 3+ newlines to a blank line, strip leading/trailing whitespace.
2. **Split into paragraphs** on blank lines (`\n\s*\n`).
3. **Pre-split oversized paragraphs** (`split_oversized`) when a single paragraph exceeds `max_chars`:
   - Break the paragraph on sentence terminators (`(?<=[.!?])\s+`).
   - Greedily pack sentences into pieces ≤ `max_chars`.
   - If a single sentence is still longer than `max_chars`, hard-chop it into `max_chars`-sized slices. This is the only place mid-sentence cuts can happen.
4. **Greedy pack into final chunks.** Walk pieces in order; the working chunk grows until adding the next piece would exceed `target_chars`, then it is flushed and the next piece starts a new chunk. Paragraph boundaries are preserved with `"\n\n"`. The last chunk is allowed to fall below `target_chars`.

Effective bounds per chunk:

- Soft target: `target_chars` (default **2200**) — used to decide when to flush.
- Hard ceiling: `max_chars` (default **3000**) — only enforced inside `split_oversized`; greedy packing in step 4 never re-checks the hard ceiling because step 3 has already guaranteed every piece is ≤ `max_chars`.

Empty input returns `[]` and `_build_tts_job` rejects the request with `text is empty after normalization`.

## Concurrency, caching, cleanup

- `TTS_SEMAPHORE = threading.Semaphore(GEMINI_TTS_CONCURRENCY)` gates how many jobs may be calling Gemini at the same time across the whole process. Default `1` keeps free-tier quota usage predictable.
- All artifacts live in `~/.cache/video-extension/tts/`:
  - `<jobId>.json` — job metadata (rehydrated on demand by `_load_tts_job`).
  - `<jobId>_chunk_<n>.wav` — per-chunk audio.
  - `<jobId>.wav` — final stitched audio (only after `done`).
- `_cleanup_tts_jobs(max_age_seconds=6 * 3600)` runs on every `POST /tts-job` and `POST /chat-tts`, deleting metadata + audio for jobs whose `finishedAt` is older than 6 hours.

## Defaults summary

All values are environment-overridable via `.env` and read once at server startup.

| Setting                          | Default                          | Where it’s used                                              |
| -------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `GEMINI_TTS_MODEL`               | `gemini-3.1-flash-tts-preview`   | Hard-coded constant.                                         |
| `GEMINI_TTS_VOICE`               | `Kore`                           | Default `voice_name` for every Gemini call.                  |
| `GEMINI_TTS_MAX_CHARS`           | `15000`                          | Upper bound on input text per request/job (truncated above). |
| `GEMINI_TTS_CHUNK_TARGET_CHARS`  | `2200`                           | Soft target chunk size in `chunk_tts_text`.                  |
| `GEMINI_TTS_CHUNK_MAX_CHARS`     | `3000`                           | Hard ceiling enforced in `split_oversized`.                  |
| `GEMINI_TTS_CONCURRENCY`         | `1`                              | Size of `TTS_SEMAPHORE`; max parallel Gemini calls.          |
| Job cache dir                    | `~/.cache/video-extension/tts`   | Job metadata + chunk/full WAVs.                              |
| Job cleanup age                  | `6 * 3600` seconds (6 h)         | `_cleanup_tts_jobs` on each new job.                         |
| Output audio                     | WAV, mono, 24000 Hz, 16‑bit PCM  | `_pcm_to_wav_bytes`.                                         |

## Minimal usage example

```bash
JOB=$(curl -s -X POST http://127.0.0.1:5055/tts-job \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello from Gemini TTS.","voiceName":"Kore"}' | jq -r .jobId)

while :; do
  STATUS=$(curl -s http://127.0.0.1:5055/tts-job/$JOB | jq -r .status)
  echo "$STATUS"
  [ "$STATUS" = "done" ] || [ "$STATUS" = "error" ] && break
  sleep 1
done

curl -s -o out.wav http://127.0.0.1:5055/tts-job/$JOB/audio
```
