# Qwen Batch TTS Usage

This service generates read-aloud WAV audio with local Qwen MLX TTS while reporting chunk progress.

## Start A Job

Send text to the existing TTS job endpoint and choose the Qwen provider:

```bash
curl -s -X POST http://127.0.0.1:5055/tts-job \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "qwen_mlx",
    "voiceName": "Aiden",
    "instruction": "Natural, clear, friendly delivery.",
    "text": "Long text to read aloud..."
  }'
```

The response includes a `jobId`.

## Check Progress

```bash
curl -s http://127.0.0.1:5055/tts-job/<jobId>
```

Useful fields:

- `status`: `queued`, `running`, `done`, `error`, `cancelling`, or `cancelled`
- `chunksTotal`: total speech chunks
- `chunksDone`: chunks generated so far
- `chunkAudioReady`: chunk indexes ready for playback
- `message`: current stage, such as `Generating chunk 2/5`

## Stream Progress Events

```bash
curl -N http://127.0.0.1:5055/tts-job/<jobId>/events
```

Use this when a UI should update as each chunk finishes.

## Play A Ready Chunk

```bash
curl -o chunk_1.wav http://127.0.0.1:5055/tts-job/<jobId>/chunk/1/audio
```

Chunks are available as soon as their index appears in `chunkAudioReady`.

## Download The Final WAV

```bash
curl -o qwen-read-aloud.wav http://127.0.0.1:5055/tts-job/<jobId>/audio
```

The final WAV is available once `status` is `done`.

## Retry Or Cancel

Retry a failed or cancelled job:

```bash
curl -s -X POST http://127.0.0.1:5055/tts-job/<jobId>/retry
```

Cancel a running job:

```bash
curl -s -X DELETE http://127.0.0.1:5055/tts-job/<jobId>
```
