# Agent Guide

Essential context for coding agents working in this Chrome extension repo. Full project documentation lives in `PROJECT_DOCS.md`.

## Project Shape

- Chrome/Edge Manifest V3 extension for YouTube segment looping, video insights, Q&A, visual analysis, custom shortcuts, and Gemini TTS read-aloud.
- `popup.js`, `popup.html`, and `popup.css` implement the extension popup UI.
- `content.js` runs on YouTube pages and controls video behavior.
- `background.js` proxies long-running local server requests.
- `server.py` is the local Flask server on `127.0.0.1:5055`.
- Python dependencies are in `requirements.txt`; runtime secrets are loaded from `.env` via `python-dotenv`.

## Critical Rules

- Chrome rejects unpacked extensions containing files or directories whose names start with `_`, including Python `__pycache__`. Always run Python checks with `PYTHONDONTWRITEBYTECODE=1`, keep virtualenvs outside `video-extension/`, and remove `__pycache__/` before asking the user to reload the extension.
- Never commit or print `.env` secrets. `GEMINI_API_KEY` and `YOUTUBE_TRANSCRIPT_API_KEY` belong in `.env`.
- Do not put temporary outputs, generated audio, virtualenvs, build artifacts, or caches in the extension root unless the user explicitly asks for a local test artifact.
- The macOS Launch Agent uses `/Users/muffu/Documents/Projects/pythonProjects/video-extension-venv/bin/python3`; install server dependencies there when changing `requirements.txt`.
- After editing popup files, the user must reload the extension in `chrome://extensions`. After editing `.env` or server dependencies, restart the local server/Launch Agent.

## Gemini TTS Notes

- TTS model: `gemini-3.1-flash-tts-preview`.
- Long text should use the chunked `/tts-job` flow, not one blocking `/tts` request.
- Gemini TTS does not stream; use `/tts-job` progress plus per-chunk audio endpoints for progressive playback.
- Free-tier Gemini TTS can return `429 RESOURCE_EXHAUSTED`; preserve partial/generated chunks, surface the error, and let users manually retry Gemini or choose Chrome `speechSynthesis` from the popup Engine selector.
- Do not auto-retry Gemini TTS failures. Retries must come from the popup Retry button, and handled TTS failures should not be logged with `console.error` because Chrome surfaces them as extension errors.

## Validation Checklist

- `PYTHONDONTWRITEBYTECODE=1 /Users/muffu/Documents/Projects/pythonProjects/video-extension-venv/bin/python3 -m py_compile server.py`
- `node --check popup.js`
- `curl -s http://127.0.0.1:5055/health`
- Remove `__pycache__/` before extension reload.
