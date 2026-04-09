# YouTube Segment Looper

A Chrome/Edge extension that loops selected time segments on YouTube videos endlessly, with AI-powered segment generation, video summaries, key pointers, and a Q&A feature — all running locally via the Codex CLI.

## What it does

- **Segment looping** — Define time ranges like `1:00-2:00, 3:00-4:00` and the extension plays only those segments on repeat, skipping everything else.
- **AI segment generation** — One click fetches the video transcript, sends it to an LLM via the Codex CLI, and returns the most important segments ready to loop. Supports a max runtime budget and custom instructions.
- **Video insights** — Three one-click analysis modes:
  - **Detailed Summary** — comprehensive, section-by-section breakdown of the entire video
  - **Short Summary** — 3-5 sentence overview of the key takeaways
  - **Key Pointers** — numbered list of every important point with timestamps and descriptions
- **Ask about the video** — Type any question about the video content and get an answer based on the transcript, without watching the whole thing.
- **Per-video storage** — Segments are saved per YouTube video ID and persist across browser sessions.
- **Transcript caching** — Transcripts are cached locally per video ID so repeat requests for the same video don't re-download. Cache auto-cleans entries older than 7 days.
- **Smart seek handling** — If you manually seek into a saved segment, playback continues from there. If you seek outside all segments, it jumps to the next one.

## Architecture

```
Chrome Extension (popup + content script)
    |
    |  POST /generate-segments
    |  POST /summary
    |  POST /ask
    v
Local Flask Server (server.py :5055)
    |
    |  1. Check transcript cache (~/.cache/video-extension/transcripts/)
    |  2. If not cached, fetch from youtube-transcript.io
    |  3. Pipe transcript via stdin to codex exec
    v
Codex CLI --> OpenAI LLM --> segments / summary / answer back to extension
```

## File structure

```
video-extension/
├── manifest.json        # Manifest V3 config
├── content.js           # Injected into YouTube — controls the <video> element
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic — segment parsing, server calls, storage
├── popup.css            # Dark theme styling
├── server.py            # Local Flask service — transcript fetching, caching, Codex CLI
├── fetch_transcript.py  # Standalone transcript download script
├── requirements.txt     # Python dependencies (flask, flask-cors, python-dotenv)
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
# Edit .env if you need to override the transcript API key
```

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
5. The segments appear in the textarea — click **Save** to apply

### Video insights

1. Click the extension icon on a YouTube video
2. Click one of the three insight buttons:
   - **Detailed Summary** — full breakdown with sections and quotes
   - **Short Summary** — quick 3-5 sentence overview
   - **Key Pointers** — all important points with timestamps
3. The result appears in the output box at the bottom of the popup

### Ask about the video

1. Click the extension icon on a YouTube video
2. Type your question in the "Ask about this video" field
3. Press **Enter** or click **Ask**
4. The answer appears in the output box, based on the transcript

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
{ "extensionInput": "0:18-0:56, 1:00-1:38", "details": "...", "title": "..." }
```

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
{ "videoId": "dQw4w9WgXcQ", "question": "What is this song about?" }

// Response
{ "answer": "It's about promising unconditional love...", "title": "..." }
```

### `GET /health`

Returns `{ "status": "ok" }` if the server is running.

## How it handles YouTube edge cases

- **SPA navigation** — Listens for `yt-navigate-finish`, title mutations, and `popstate` to detect page changes without full reloads.
- **Ads** — Detects the `.ad-showing` class on `#movie_player` and pauses segment enforcement during ads.
- **Lazy video loading** — A `MutationObserver` watches for the `<video>` element to appear in the DOM.
- **Manual seeking** — If you seek into a segment, playback continues from there. If you seek outside all segments, it jumps to the start of the next segment.
- **Playback speed** — No special handling needed; `timeupdate` fires based on real playback time regardless of speed.

## Limitations

- Only works on YouTube in the desktop browser (no mobile, no other video sites)
- The local server must be running for AI features (segment generation, summaries, Q&A)
- Codex CLI must be installed and authenticated
- Transcript availability depends on the youtube-transcript.io API and whether the video has captions
