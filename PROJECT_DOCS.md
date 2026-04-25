# Project Documentation: YouTube Segment Looper + Shortcuts

A Chrome/Edge extension for power-watching YouTube. It loops selected time segments, generates AI segments and summaries, answers questions about a video, analyzes its visuals — all running locally via the Codex CLI — and gives you fully customizable keyboard shortcuts that work on regular videos, Shorts, and even the hover-preview videos on the home feed.

## What it does

- **Segment looping** — Define time ranges like `1:00-2:00, 3:00-4:00` and the extension plays only those segments on repeat, skipping everything else.
- **AI segment generation** — One click fetches the video transcript, sends it to an LLM via the Codex CLI, and returns the most important segments ready to loop. Supports a max runtime budget and custom instructions.
- **Video insights** — Three one-click analysis modes:
  - **Detailed Summary** — comprehensive, section-by-section breakdown of the entire video
  - **Short Summary** — 3-5 sentence overview of the key takeaways
  - **Key Pointers** — numbered list of every important point with timestamps and descriptions
- **Ask about the video** — Type any question about the video content and get an answer based on the transcript, without watching the whole thing. Optionally enable **web search** to let the LLM look up additional context, verify claims, or find related information beyond the transcript.
- **Visual analysis** — Capture screenshots of a video segment, collage them with transcript context, and send to a vision-capable LLM. Useful for analyzing diagrams, code on screen, slides, or anything not captured by captions alone. Features:
  - Seek-and-capture (no real-time playback required — frames are grabbed by seeking through the video)
  - Configurable capture interval (1–10 seconds, default 1 frame every 2s)
  - Automatic cropping to the video player (excludes YouTube UI chrome)
  - Frame deduplication (skips near-identical consecutive frames to save cost)
  - Frames are collaged into grids with timestamp overlays and sent alongside the transcript to `codex exec --image`
  - Optional **web search** toggle to enrich answers with live internet context
- **Custom keyboard shortcuts** — Bind any key (with optional `Ctrl`/`Shift`/`Alt`/`Cmd` modifiers) to a catalog of ~25 video actions: play/pause, rewind, advance, per-binding speed steps, volume, mute, fullscreen, captions, frame step, segment navigation, markers A/B, Shorts navigation, and more. Actions work on the main YouTube player (including during ads), on Shorts as you scroll, and on the hover-preview video that plays when you mouse over a thumbnail.
- **Speed overlay** — A small semi-transparent `1.00x` pill shown over the video player that updates live as speed changes. Toggleable from the popup, the options page, or a keyboard shortcut (default `V`).
- **Shorts helpers** — Auto-scroll to the next Short when the current one finishes, plus bindable keys for next/previous Short (defaults: left `Shift` and `Tab`).
- **Per-video storage** — Segments are saved per YouTube video ID and persist across browser sessions.
- **Transcript caching** — Transcripts are cached locally per video ID so repeat requests for the same video don't re-download. Cache auto-cleans entries older than 7 days.
- **Gemini TTS read-aloud** — Reads generated answers and summaries aloud using chunked Gemini TTS jobs with progress, retry handling, playback controls, seeking, and speed selection.
- **Smart seek handling** — If you manually seek into a saved segment, playback continues from there. If you seek outside all segments, it jumps to the next one.

## Architecture

```
Chrome Extension (popup + content script)
    |
    |  POST /generate-segments      (transcript-based)
    |  POST /summary                (transcript-based)
    |  POST /ask                    (transcript-based)
    |  POST /visual-analyze         (screenshots + transcript)
    |  POST /tts-job + poll status  (Gemini TTS)
    v
Local Flask Server (server.py :5055)
    |
    |  1. Check transcript cache (~/.cache/video-extension/transcripts/)
    |  2. If not cached, fetch from youtube-transcript.io
    |  3. For visual analysis: decode frames, crop, dedup, build collages
    |  4. Pipe transcript via stdin + collage images via --image to codex exec
    |  5. Chunk long TTS text and generate stitched WAV audio with Gemini
    v
Codex CLI --> OpenAI LLM --> segments / summary / answer / visual analysis back to extension
```

## File structure

```
video-extension/
├── manifest.json        # Manifest V3 config
├── background.js        # Service worker — proxies requests to the local server, opens options page
├── content.js           # Injected into YouTube — segment enforcement, video tracking, shortcut dispatcher, speed overlay
├── shortcuts-defs.js    # Shared catalog: action list, default bindings, key matcher, formatter
├── popup.html           # Extension popup UI (Transcript / Visual Analysis / Shorts / Shortcuts tabs)
├── popup.js             # Popup logic — segment parsing, server calls, storage, shortcut toggles
├── popup.css            # Dark theme styling for the popup
├── options.html         # Full-page Shortcuts settings editor
├── options.js           # Options-page logic — row rendering, key capture, conflict detection, save/reset
├── options.css          # Dark theme styling for the options page
├── server.py            # Local Flask service — transcript fetching, caching, Codex CLI, Gemini TTS
├── fetch_transcript.py  # Standalone transcript download script
├── test_gemini_tts.py   # Gemini TTS smoke, chunking, and job-flow test helper
├── AGENTS.md            # Short always-needed guide for coding agents
├── PROJECT_DOCS.md      # Full project documentation
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variable template
├── .gitignore
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Setup

### Prerequisites

- Chrome or Edge browser
- Python 3.10+
- [Codex CLI](https://github.com/openai/codex) installed and authenticated (`codex login`)
- Node.js (for Codex CLI)

### 1. Install Python dependencies

Create a virtual environment **outside** the extension folder (Chrome rejects directories containing `__pycache__`):

```bash
cd /path/to/parent/directory
python3 -m venv video-extension-venv
source video-extension-venv/bin/activate
pip install -r video-extension/requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Paste your Gemini API key into GEMINI_API_KEY if you want Gemini TTS
```

For Gemini TTS, create a key at [Google AI Studio API Keys](https://aistudio.google.com/app/apikey), then edit `.env`:

```bash
GEMINI_API_KEY=your_google_ai_studio_key_here
GEMINI_TTS_VOICE=Kore
GEMINI_TTS_MAX_CHARS=15000
GEMINI_TTS_CHUNK_TARGET_CHARS=2200
GEMINI_TTS_CHUNK_MAX_CHARS=3000
GEMINI_TTS_CONCURRENCY=1
```

This integration uses the Gemini Developer API model `gemini-3.1-flash-tts-preview`. Google's Gemini API pricing page lists this model's Standard free tier input and output as free of charge; keep the key in a free-tier AI Studio project without billing enabled if you want to avoid paid usage. The local server caps each TTS request to `GEMINI_TTS_MAX_CHARS` characters, then splits longer text into smaller Gemini calls using the chunk settings above.

Free-tier Gemini TTS can be very quota-constrained. If Google returns `429 RESOURCE_EXHAUSTED`, the server stops the job with a structured error, includes retry timing when available, and the popup shows a manual Retry button instead of silently retrying. Since each chunk is a Gemini request, lowering chunk count can reduce quota pressure, while smaller chunks improve perceived progress and reliability.

### 3. Load the extension

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `video-extension` folder
5. Pin the extension in the toolbar for easy access

### 4. Start the local server

```bash
PYTHONDONTWRITEBYTECODE=1 /path/to/video-extension-venv/bin/python3 server.py
```

Or set it up as a macOS Launch Agent so it runs automatically (see below).

## Usage

### Manual segments

1. Go to any YouTube video
2. Click the extension icon
3. Type segments: `1:00-2:00, 3:00-4:00, 5:30-6:30`
4. Toggle **Loop** on
5. Click **Save**

The video jumps between those segments endlessly.

### AI-generated segments

1. Click the extension icon on a YouTube video
2. (Optional) Type instructions like "focus on the Iran discussion"
3. (Optional) Enter a max runtime in minutes
4. Click **Generate Segments**
5. The segments appear in the textarea along with their total duration — click **Save** to apply

The total duration is shown next to the **Segments** label and updates live as you edit the textarea, so you can see how long your looped playback will run before saving.

### Video insights

1. Click the extension icon on a YouTube video
2. Click one of the three insight buttons:
   - **Detailed Summary** — full breakdown with sections and quotes
   - **Short Summary** — quick 3-5 sentence overview
   - **Key Pointers** — all important points with timestamps
3. The result appears in the output box at the bottom of the popup
4. Click the speaker button to read the result aloud with Gemini TTS, if `GEMINI_API_KEY` is configured. Long results show chunk progress and begin playback once the first chunk is ready.

### Ask about the video

1. Click the extension icon on a YouTube video
2. Type your question in the "Ask about this video" field
3. (Optional) Toggle **Web search** to let the LLM search the internet for additional context
4. Press **Enter** or click **Ask**
5. The answer appears in the output box, based on the transcript (and web results when enabled)

### Visual analysis

1. Click the extension icon on a YouTube video
2. Switch to the **Visual Analysis** tab
3. Set the time window using the slider or type exact times (defaults to ±30s around current position)
4. Adjust the capture interval if needed (default: 1 frame every 2 seconds)
5. (Optional) Toggle "Skip similar frames" to deduplicate static scenes
6. (Optional) Type a question like "What diagram is shown at 1:15?"
7. (Optional) Toggle **Web search** to let the LLM search the internet for additional context
8. Click **Capture & Analyze**
9. Keep the tab visible while frames are captured (the video scrubs through the window automatically)
10. The result appears in the output box once the LLM responds

The extension pauses the video, seeks frame-by-frame, takes a screenshot at each position, then restores your original playback position. Frames are cropped to just the video player, collaged into grids of up to 10, overlaid with timestamps, and sent alongside the transcript to the Codex CLI's `--image` flag for vision model analysis.

### Keyboard shortcuts

Shortcuts are fully customizable from a dedicated options page.

**Default bindings** (edit from the **Shortcuts** tab → **Open shortcut settings**):

| Key        | Action                  |
|------------|-------------------------|
| `A` / `P`  | Play / pause            |
| `Q` / `W`  | Rewind 5s / Advance 5s  |
| `Z` / `X`  | Rewind 5s / Advance 5s  |
| `[` / `]`  | Rewind 5s / Advance 5s  |
| `;` / `'`  | Rewind 3s / Advance 3s  |
| `S` / `D`  | Speed down / up by 0.05 |
| `V`        | Toggle speed overlay    |
| `Shift`←   | Next Short              |
| `Tab`      | Previous Short          |

**Full action catalog** (available in the options page dropdown):

- **Playback** — Play/pause, rewind, advance, seek to start/end, frame step backward/forward, preferred speed, reset speed, speed up, speed down
- **Audio** — Volume up, volume down, toggle mute
- **Display** — Toggle fullscreen, toggle theater mode, toggle mini-player, toggle captions, toggle speed overlay
- **Segments** — Next segment, previous segment, toggle loop, set marker A, set marker B, jump to marker A, jump to marker B
- **Shorts** — Next Short, previous Short

**Tips:**

- Each rewind/advance/speed binding can carry its own step value (e.g. `Q` = 5s, `;` = 3s). Leave the value blank to use the global default.
- Bindings use `event.code` internally so they survive across keyboard layouts, but show the human-readable key in the UI.
- Duplicate combinations are flagged with a red border in the options page and block saving until resolved.
- Shortcuts are ignored while you're typing in a text field or `contenteditable` element (toggleable).
- Playback-related shortcuts target whichever video is "active" — the one you're hovering, failing that the one that's currently playing and visible, failing that the biggest visible one. So the same keys work on the main player, on Shorts, and on hover-preview videos.
- Playback shortcuts continue to work while a YouTube ad is playing.
- Segment/marker shortcuts always target the main YouTube player.
- All settings (bindings, toggles, steps) are stored in `chrome.storage.local` and persist across browser restarts and extension reloads. Reinstalling the extension or explicitly clicking **Clear all data** wipes them.

### Speed overlay

A small `1.00x` pill is rendered in the top-left of the video player and updates live when you change playback speed. It's low-opacity by default and pointer-events-none, so it never blocks clicks. Toggle it from:

- **Popup** → Shortcuts tab → *Speed overlay on video*
- **Options page** → *Show speed overlay on video*
- Keyboard shortcut — default `V`

## Keeping the server running

### Linux (systemd user service)

A systemd user service is installed at:

```
~/.config/systemd/user/video-extension-server.service
```

It starts the server at login and restarts it automatically if it crashes.

```bash
# Reload after editing the service file
systemctl --user daemon-reload

# Enable (auto-start at login) + start now
systemctl --user enable --now video-extension-server.service

# Stop
systemctl --user stop video-extension-server.service

# Disable auto-start
systemctl --user disable video-extension-server.service

# Check status
systemctl --user status video-extension-server.service

# Check logs
journalctl --user -u video-extension-server.service -f

# Verify
curl -s http://127.0.0.1:5055/health
```

### macOS (Launch Agent)

A Launch Agent plist is installed at:

```
~/Library/LaunchAgents/com.muffu.video-extension-server.plist
```

It starts the server at login and restarts it automatically if it crashes.

```bash
# Load (start)
launchctl load ~/Library/LaunchAgents/com.muffu.video-extension-server.plist

# Unload (stop)
launchctl unload ~/Library/LaunchAgents/com.muffu.video-extension-server.plist

# Check logs
tail -f /tmp/video-extension-server.log

# Verify
curl -s http://127.0.0.1:5055/health
```

## Transcript caching

Transcripts are cached at `~/.cache/video-extension/transcripts/` as JSON files named by video ID. On each new request, the server:

1. Checks if a cached transcript exists and is less than 7 days old
2. If cached, uses it directly (no network call)
3. If not cached or expired, fetches from the API and saves to cache
4. After each fetch, cleans up any cache files older than 7 days

This means the first request for a video hits the API, but every subsequent request (generate segments, ask a question, get a summary) for the same video is instant.

## Server API

### `POST /generate-segments`

Fetches the transcript and returns AI-extracted segments.

```json
// Request
{ "videoId": "dQw4w9WgXcQ", "maxMinutes": 10, "instructions": "skip intros" }

// Response
{
  "extensionInput": "0:18-0:56, 1:00-1:38",
  "details": "...",
  "title": "...",
  "totalSeconds": 76,
  "totalFormatted": "1:16"
}
```

`totalSeconds` and `totalFormatted` are the summed duration of the returned segments; the popup displays this next to the Segments label so you can see at a glance how long the looped playback will be.

### `POST /summary`

Generates a video summary of the specified type.

```json
// Request
{ "videoId": "dQw4w9WgXcQ", "type": "detailed" }
// type can be: "detailed", "short", or "key-pointers"

// Response
{ "summary": "This video covers...", "title": "..." }
```

### `POST /ask`

Answers a question about the video based on its transcript.

```json
// Request
{ "videoId": "dQw4w9WgXcQ", "question": "What is this song about?", "webSearch": false }

// Response
{ "answer": "It's about promising unconditional love...", "title": "..." }
```

When `webSearch` is `true`, the server passes `--search` to the Codex CLI for live web search and appends an instruction to the prompt encouraging the LLM to cite web sources.

### `POST /visual-analyze`

Captures video frames as screenshots, builds collages, and sends them with the transcript to a vision-capable LLM.

```json
// Request
{
  "videoId": "dQw4w9WgXcQ",
  "frames": [
    { "timestamp": 60, "dataUrl": "data:image/jpeg;base64,..." },
    { "timestamp": 62, "dataUrl": "data:image/jpeg;base64,..." }
  ],
  "videoRect": { "x": 0, "y": 56, "width": 854, "height": 480, "tabWidth": 1280, "tabHeight": 800, "devicePixelRatio": 2 },
  "startTime": 60,
  "endTime": 120,
  "deduplicate": true,
  "question": "What diagram is shown at 1:15?",
  "webSearch": false
}

// Response
{ "answer": "The diagram shows a three-layer architecture...", "title": "...", "framesAnalyzed": 12 }
```

### `POST /tts`

Generates read-aloud audio using Gemini TTS in a single blocking request. This endpoint is kept for short smoke tests and backwards compatibility; the popup uses `/tts-job` for better progress and reliability.

```json
// Request
{ "text": "Say cheerfully: Have a wonderful day!", "voiceName": "Kore" }

// Response
{
  "audioBase64": "...",
  "mimeType": "audio/wav",
  "model": "gemini-3.1-flash-tts-preview",
  "voiceName": "Kore",
  "truncated": false
}
```

### `POST /tts-job`

Starts an asynchronous chunked Gemini TTS job and returns immediately.

```json
// Request
{ "text": "Long summary text...", "voiceName": "Kore" }

// Response
{
  "jobId": "...",
  "status": "queued",
  "model": "gemini-3.1-flash-tts-preview",
  "voiceName": "Kore",
  "inputChars": 9844,
  "chunksTotal": 5,
  "chunksDone": 0,
  "chunksReady": 0,
  "chunkAudioReady": [],
  "audioReady": false
}
```

### `GET /tts-job/<jobId>`

Returns TTS progress. The popup polls this endpoint while speech is generated.

```json
{
  "jobId": "...",
  "status": "running",
  "chunksTotal": 5,
  "chunksDone": 2,
  "chunksReady": 2,
  "chunkAudioReady": [1, 2],
  "currentChunk": 3,
  "message": "Generating chunk 3/5",
  "audioReady": false,
  "chunkTimings": [
    { "chunkIndex": 1, "chars": 2032, "elapsedSeconds": 31.4, "audioSeconds": 74.2 }
  ]
}
```

Status values are `queued`, `running`, `done`, `error`, `cancelling`, and `cancelled`; older cached jobs may still show `rate_limited`. Errors are structured with `type`, `message`, `retryable`, `retryAfterSeconds`, and `chunkIndex`.

The server uses `GEMINI_TTS_CONCURRENCY` to limit simultaneous Gemini TTS calls. The default is `1`, which is safer for free-tier projects and means multiple YouTube tabs can create jobs while the server processes them in order.

TTS job metadata and audio are cached under `~/.cache/video-extension/tts/`, so a popup can be closed and reopened for the same video and still recover the generated audio while the local server cache entry exists. Old finished jobs are cleaned up automatically.

The popup shows a read-aloud toolbar above generated text, so the Engine selector is available before playback starts and does not cover the text. `Gemini TTS` uses the chunked server job and generated WAV playback with seek controls, while `Local browser` uses Chrome's built-in `speechSynthesis` without calling Gemini. Local browser audio is not a generated WAV file, so it is not cached like Gemini output and browser APIs do not support precise seeking; the popup hides the generated-audio control panel in local mode and uses a simple Stop/restart button.

### `GET /tts-job/<jobId>/chunk/<index>/audio`

Returns a generated chunk WAV as soon as that chunk is ready. The popup uses this for progressive playback while later chunks are still being generated.

### `GET /tts-job/<jobId>/audio`

Returns the final stitched WAV after the job status is `done`.

### `POST /tts-job/<jobId>/retry`

Retries a failed or cancelled job from the first unfinished chunk. Already generated chunks are reused.

### `DELETE /tts-job/<jobId>`

Requests cancellation for an in-progress TTS job.

### `GET /health`

Returns `{ "status": "ok" }` if the server is running.

## Testing Gemini TTS

Inspect chunking without calling Gemini:

```bash
PYTHONDONTWRITEBYTECODE=1 /path/to/video-extension-venv/bin/python3 test_gemini_tts.py \
  --file sample_summary.txt \
  --chunk-only
```

Run through the local chunked job API:

```bash
PYTHONDONTWRITEBYTECODE=1 /path/to/video-extension-venv/bin/python3 test_gemini_tts.py \
  --file sample_summary.txt \
  --via-job \
  --out /tmp/sample_summary_tts.wav
```

For a tiny live smoke test:

```bash
PYTHONDONTWRITEBYTECODE=1 /path/to/video-extension-venv/bin/python3 test_gemini_tts.py \
  --text "Chunked Gemini TTS job flow is working." \
  --via-job \
  --out /tmp/video-extension-tts-job-smoke.wav
```

## How it handles YouTube edge cases

- **SPA navigation** — Listens for `yt-navigate-finish`, title mutations, and `popstate` to detect page changes without full reloads.
- **Ads** — Detects the `.ad-showing` class on `#movie_player` and pauses segment enforcement during ads.
- **Lazy video loading** — A `MutationObserver` watches for the `<video>` element to appear in the DOM.
- **Manual seeking** — If you seek into a segment, playback continues from there. If you seek outside all segments, it jumps to the start of the next segment.
- **Playback speed** — No special handling needed; `timeupdate` fires based on real playback time regardless of speed.

## Storage and privacy

All extension state is kept in `chrome.storage.local`:

- Per-video segments (`segments_<videoId>`) and global loop toggle
- Shortcut settings: bindings, global steps, speed overlay preference, markers A/B
- Transcript API key override (if set)

Nothing leaves your machine unless you invoke an AI feature, in which case the transcript (and, for visual analysis, the cropped frame collages) is sent to the Codex CLI running locally, which in turn calls your configured OpenAI account. If you click a speaker button with Gemini TTS configured, the displayed text is sent to the Gemini API to generate audio. Clearing extension data (Shorts tab → **Clear all data**) wipes segments and shortcut settings.

## Limitations

- Only works on YouTube in the desktop browser (no mobile, no other video sites). Keyboard shortcuts target any `<video>` element found on a YouTube page but the extension is not injected on other domains.
- The local server must be running for AI features (segment generation, summaries, Q&A, visual analysis). It is **not** required for manual segments, keyboard shortcuts, or the speed overlay.
- Codex CLI must be installed and authenticated for transcript/visual AI features
- Gemini TTS requires `GEMINI_API_KEY` in `.env`
- Gemini TTS does not stream; long text is chunked, and the popup plays generated chunks progressively while the final stitched WAV is prepared
- Gemini may occasionally return transient `500` errors; the server retries per chunk
- Transcript availability depends on the youtube-transcript.io API and whether the video has captions
- Visual analysis requires the tab to stay visible and focused during frame capture
- Each collage image sent to the LLM must be under 5 MB (the server saves collages as JPEG at quality 85 to stay within this limit)
