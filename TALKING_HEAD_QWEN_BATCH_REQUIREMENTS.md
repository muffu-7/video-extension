# Requirement: Session-Scoped Qwen Chunk Batch CLI

## Purpose

`video-extension` needs a more efficient way to generate local Qwen MLX TTS audio for long read-aloud requests.

The current integration calls the existing `talking_head` Qwen path once per chunk. That causes each chunk to start a new Python/MLX process and reload the model. For multi-chunk summaries, this wastes time and resources.

The desired behavior is **not** a long-running daemon. The model should not stay resident in memory all the time. Instead, `talking-head` should provide a per-request batch command:

1. Start one process for one TTS job.
2. Load the Qwen MLX model once.
3. Generate all provided chunks sequentially.
4. Write each chunk WAV as soon as it is ready.
5. Emit machine-readable progress after each chunk.
6. Exit when done so model memory is released.

## Target Consumer

The immediate consumer is:

```text
/Users/muffu/Documents/Projects/pythonProjects/video-extension/server.py
```

`video-extension` will keep its existing public API:

- `POST /tts-job`
- `GET /tts-job/<jobId>`
- `GET /tts-job/<jobId>/events`
- `GET /tts-job/<jobId>/chunk/<index>/audio`
- `GET /tts-job/<jobId>/audio`
- `POST /tts-job/<jobId>/retry`
- `DELETE /tts-job/<jobId>`

The Chrome extension popup should not need to know that this new batch command exists.

## Proposed Command

Add a new CLI command to `talking-head`, for example:

```bash
talking-head qwen-chunks \
  --chunks-json /path/to/chunks.json \
  --output-dir /path/to/output-dir \
  --config /path/to/config/qwen.local.yaml \
  --voice Aiden \
  --instruction "Natural, clear, friendly delivery."
```

An equivalent Python module entrypoint is also acceptable:

```bash
python -m talking_head.qwen_chunks ...
```

The command must process chunks in ascending `index` order.

## Input File Contract

`--chunks-json` points to a UTF-8 JSON file.

Preferred shape:

```json
{
  "chunks": [
    { "index": 1, "text": "First chunk text." },
    { "index": 2, "text": "Second chunk text." }
  ]
}
```

Acceptable alternative if simpler:

```json
[
  { "index": 1, "text": "First chunk text." },
  { "index": 2, "text": "Second chunk text." }
]
```

Validation requirements:

- `chunks` must contain at least one item.
- `index` must be a positive integer.
- indexes must be unique.
- `text` must be a non-empty string after trimming.
- The command should sort by `index` before generation.
- Invalid input should exit non-zero and emit a JSON error event.

## Output Files

`--output-dir` must be created if it does not exist.

For each chunk, write:

```text
chunk_<index>.wav
```

Examples:

```text
chunk_1.wav
chunk_2.wav
chunk_3.wav
```

WAV requirements:

- Valid WAV container.
- Browser-playable PCM is preferred.
- All generated chunk WAVs in one command invocation must have compatible WAV params so `video-extension` can concatenate them.
- Expected current Qwen output is mono, 16-bit, 24000 Hz. If the exact format changes, every chunk must still share the same format.

Do not write generated files into the Chrome extension root.

## Progress Protocol

The command must emit **JSON Lines** to stdout.

Each line must be one complete JSON object followed by `\n`.

Do not emit human-readable progress to stdout. Human logs may go to stderr.

Required events:

### `started`

Emitted after input validation and before the first chunk generation.

```json
{
  "event": "started",
  "chunksTotal": 4,
  "model": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit",
  "voice": "Aiden"
}
```

### `chunk_started`

Emitted immediately before generation for each chunk.

```json
{
  "event": "chunk_started",
  "chunkIndex": 1,
  "chunksTotal": 4,
  "chars": 1090
}
```

### `chunk_done`

Emitted after the chunk WAV has been fully written and closed.

```json
{
  "event": "chunk_done",
  "chunkIndex": 1,
  "chunksTotal": 4,
  "chars": 1090,
  "path": "/absolute/path/to/output-dir/chunk_1.wav",
  "elapsedSeconds": 27.28,
  "audioSeconds": 96.0,
  "bytes": 4608044
}
```

`path` must be absolute.

### `done`

Emitted after all chunks are done.

```json
{
  "event": "done",
  "chunksTotal": 4,
  "elapsedSeconds": 79.3
}
```

### `error`

Emitted before non-zero exit when possible.

```json
{
  "event": "error",
  "type": "dependency_error",
  "message": "mlx-audio is not installed.",
  "chunkIndex": 2,
  "retryable": false
}
```

Recommended error types:

- `input_error`
- `config_error`
- `dependency_error`
- `model_error`
- `generation_error`
- `cancelled`

## Exit Codes

Recommended:

- `0`: all chunks generated successfully.
- `2`: invalid input or arguments.
- `3`: config/model/dependency error.
- `4`: generation failed.
- `130`: interrupted/cancelled.

`video-extension` will primarily rely on JSON events plus non-zero exit.

## Cancellation Behavior

`video-extension` may cancel a job by terminating the subprocess.

The command should handle `SIGTERM` and `SIGINT` gracefully if practical:

- stop generating new chunks
- leave already completed chunk WAVs in place
- avoid corrupting the chunk currently being written
- emit a `cancelled` or `error` event if possible
- exit non-zero

It is acceptable for the in-progress chunk file to be missing or incomplete after cancellation. `video-extension` will only treat a chunk as ready after receiving `chunk_done`.

## Model Loading Requirement

Within a single command invocation:

- Load Qwen/MLX model once.
- Reuse the loaded model for all chunks.
- Generate chunks sequentially.
- Do not spawn a new `mlx_audio.tts.generate` subprocess per chunk.

After the command exits:

- It is expected and desired that model memory is released.
- No background daemon should remain running.

## Config and Voice Options

Required CLI options:

```text
--chunks-json PATH
--output-dir PATH
--config PATH
```

Recommended options:

```text
--voice TEXT
--language TEXT
--instruction TEXT
--ref-audio PATH
--ref-text TEXT
```

Defaults should match existing `talking-head` Qwen config where possible:

- voice: config `tools.qwen_voice`, usually `Aiden`
- language: config `tools.qwen_language`, usually `English`
- instruction: config `tools.qwen_instruct`
- model: config `tools.qwen_model`

Relative paths in config should resolve relative to the `talking-head` repo/config context, matching existing behavior expectations.

## Performance Goal

The command should optimize for:

- one model load per read-aloud job
- progressive first chunk availability
- stable memory use
- sequential generation only
- no idle model residency after job completion

Recommended `video-extension` chunk settings once this exists:

```env
QWEN_TTS_CONCURRENCY=1
QWEN_TTS_CHUNK_TARGET_CHARS=900
QWEN_TTS_CHUNK_MAX_CHARS=1300
```

Reasoning:

- smaller chunks improve time-to-first-audio
- model load is paid once per job, not once per chunk
- sequential generation avoids Metal/GPU contention

## Integration Expectations in `video-extension`

`video-extension` will call the batch command once per Qwen `/tts-job`.

Expected flow:

1. Build normal TTS chunks.
2. Write `chunks.json` into a temp/cache job folder.
3. Spawn `talking-head qwen-chunks ...`.
4. Read stdout line-by-line.
5. On `chunk_done`, copy or record the chunk WAV path into the existing job state.
6. Notify `/tts-job/<jobId>/events` listeners.
7. After process success, stitch all chunk WAVs into the existing final job WAV.
8. On failure, preserve completed chunks and mark job `error`.
9. On retry, reuse already completed chunks and invoke the command only for missing chunks if practical.

## Backwards Compatibility

This should not remove or break existing commands:

- `talking-head generate`
- `talking-head dialogue-audio`
- `talking-head-conversation-latest`
- existing Piper/Qwen full video pipeline

The new command can live alongside them.

## Acceptance Tests

### Single Chunk

Command:

```bash
talking-head qwen-chunks \
  --chunks-json /tmp/qwen-test/chunks.json \
  --output-dir /tmp/qwen-test/audio \
  --config /Users/muffu/Documents/Projects/pythonProjects/talking-head/config/qwen.local.yaml \
  --voice Aiden \
  --instruction "Natural, clear, friendly delivery."
```

Input:

```json
{
  "chunks": [
    { "index": 1, "text": "Hello from Qwen local TTS." }
  ]
}
```

Expected:

- exits `0`
- emits `started`, `chunk_started`, `chunk_done`, `done`
- writes `/tmp/qwen-test/audio/chunk_1.wav`
- WAV opens with Python `wave`

### Multi Chunk

Input contains 4 chunks.

Expected:

- one process invocation
- emits 4 `chunk_done` events
- writes 4 WAV files
- all WAV files share the same channel count, sample width, and frame rate
- exits `0`

### Bad Input

Input has an empty chunk text.

Expected:

- emits `error` with `type: "input_error"`
- exits non-zero
- does not generate misleading partial success.

### Cancellation

Start a long multi-chunk job, send SIGTERM during chunk 2.

Expected:

- chunk 1 remains usable if it had emitted `chunk_done`
- no later chunk is marked done unless fully written
- process exits non-zero
- no child Qwen process remains.

