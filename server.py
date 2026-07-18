#!/usr/bin/env python3
"""Local service that fetches a YouTube transcript and uses the Codex CLI to
extract segments, generate summaries, and answer questions about videos."""

import sys
sys.dont_write_bytecode = True

import base64
from dataclasses import replace
import glob
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import urllib.error
import uuid
import wave

from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200 MB for visual analysis payloads
CORS(app)

TRANSCRIPT_API_URL = "https://www.youtube-transcript.io/api/transcripts"
CACHE_DIR = os.path.expanduser("~/.cache/video-extension/transcripts")
CACHE_MAX_AGE_DAYS = 7
GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview"
GEMINI_TTS_DEFAULT_VOICE = os.environ.get("GEMINI_TTS_VOICE", "Kore")
GEMINI_TTS_MAX_CHARS = int(os.environ.get("GEMINI_TTS_MAX_CHARS", "15000"))
GEMINI_TTS_CHUNK_TARGET_CHARS = int(os.environ.get("GEMINI_TTS_CHUNK_TARGET_CHARS", "2200"))
GEMINI_TTS_CHUNK_MAX_CHARS = int(os.environ.get("GEMINI_TTS_CHUNK_MAX_CHARS", "3000"))
GEMINI_TTS_CONCURRENCY = max(1, int(os.environ.get("GEMINI_TTS_CONCURRENCY", "1")))
QWEN_TTS_PROVIDER = "qwen_mlx"
QWEN_TTS_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit"
QWEN_TTS_REPO = os.environ.get(
    "QWEN_TTS_REPO",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "talking-head")),
)
QWEN_TTS_CONFIG = os.environ.get(
    "QWEN_TTS_CONFIG",
    os.path.join(QWEN_TTS_REPO, "config", "qwen.local.yaml"),
)
QWEN_TTS_PYTHON = os.environ.get(
    "QWEN_TTS_PYTHON",
    os.path.join(QWEN_TTS_REPO, ".venv", "bin", "python"),
)
QWEN_TTS_DEFAULT_VOICE = os.environ.get("QWEN_TTS_VOICE", "Aiden")
QWEN_TTS_DEFAULT_INSTRUCT = os.environ.get("QWEN_TTS_INSTRUCT", "Natural, clear, friendly delivery.")
QWEN_TTS_MAX_CHARS = int(os.environ.get("QWEN_TTS_MAX_CHARS", str(GEMINI_TTS_MAX_CHARS)))
QWEN_TTS_CHUNK_TARGET_CHARS = int(os.environ.get("QWEN_TTS_CHUNK_TARGET_CHARS", "450"))
QWEN_TTS_CHUNK_MAX_CHARS = int(os.environ.get("QWEN_TTS_CHUNK_MAX_CHARS", "650"))
QWEN_TTS_CONCURRENCY = max(1, int(os.environ.get("QWEN_TTS_CONCURRENCY", "1")))
TTS_JOB_DIR = os.path.expanduser("~/.cache/video-extension/tts")
SESSION_DIR = os.path.expanduser("~/.cache/video-extension/sessions")
SESSION_MAX_AGE_DAYS = int(os.environ.get("VIDEO_EXTENSION_SESSION_MAX_AGE_DAYS", "30"))
CHAT_HISTORY_MAX_CHARS = int(os.environ.get("VIDEO_EXTENSION_CHAT_HISTORY_MAX_CHARS", "16000"))
CHAT_HISTORY_MAX_MESSAGES = int(os.environ.get("VIDEO_EXTENSION_CHAT_HISTORY_MAX_MESSAGES", "16"))
CHAT_PRIOR_IMAGE_LIMIT = int(os.environ.get("VIDEO_EXTENSION_CHAT_PRIOR_IMAGE_LIMIT", "3"))

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(TTS_JOB_DIR, exist_ok=True)
os.makedirs(SESSION_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Transcript fetching + caching
# ---------------------------------------------------------------------------

def _cache_path(video_id):
    return os.path.join(CACHE_DIR, f"{video_id}.json")


def _read_cache(video_id):
    path = _cache_path(video_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            cached = json.load(f)
        age_days = (time.time() - cached.get("fetched_at", 0)) / 86400
        if age_days > CACHE_MAX_AGE_DAYS:
            os.unlink(path)
            return None
        return cached["data"]
    except (json.JSONDecodeError, KeyError, OSError):
        return None


def _write_cache(video_id, data):
    path = _cache_path(video_id)
    with open(path, "w") as f:
        json.dump({"fetched_at": time.time(), "data": data}, f)


def _cleanup_old_cache():
    cutoff = time.time() - (CACHE_MAX_AGE_DAYS * 86400)
    for path in glob.glob(os.path.join(CACHE_DIR, "*.json")):
        try:
            if os.path.getmtime(path) < cutoff:
                os.unlink(path)
        except OSError:
            pass


def fetch_transcript(video_id):
    cached = _read_cache(video_id)
    if cached:
        return cached

    api_key = os.environ.get("YOUTUBE_TRANSCRIPT_API_KEY", "68280dd15832dd71e667d308")
    payload = json.dumps({"ids": [video_id]}).encode("utf-8")
    req = urllib.request.Request(
        TRANSCRIPT_API_URL,
        data=payload,
        headers={
            "Authorization": f"Basic {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    _write_cache(video_id, data)
    _cleanup_old_cache()
    return data


def get_transcript_text(video_id, start_time=None, end_time=None):
    """Fetch transcript for a video and return (transcript_text, title) or raise."""
    data = fetch_transcript(video_id)

    if not data or not isinstance(data, list) or len(data) == 0:
        raise ValueError("No transcript data returned")

    video = data[0]
    tracks = video.get("tracks", [])
    if not tracks:
        raise ValueError("No transcript tracks available")

    track = tracks[0].get("transcript", [])
    for t in tracks:
        if t.get("language", "").lower() in ("en", "english"):
            track = t["transcript"]
            break

    transcript_text = build_transcript_text(track, start_time=start_time, end_time=end_time)
    if not transcript_text.strip():
        raise ValueError("Transcript is empty")

    return transcript_text, video.get("title", video_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def format_time(seconds):
    s = float(seconds)
    m = int(s) // 60
    sec = int(s) % 60
    return f"{m:02d}:{sec:02d}"


def build_transcript_text(track, start_time=None, end_time=None):
    lines = []
    for entry in track:
        try:
            start = float(entry.get("start", 0))
        except (ValueError, TypeError):
            continue
        if math.isnan(start):
            continue
        if start_time is not None and start < start_time:
            continue
        if end_time is not None and start > end_time:
            continue
        text = entry.get("text", "").replace("\n", " ")
        lines.append(f"{format_time(start)} {text}")
    return "\n".join(lines)


def _parse_usage_from_jsonl(stdout_text):
    """Extract token usage from codex exec --json JSONL output."""
    usage = None
    for line in stdout_text.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
            if event.get("type") == "turn.completed" and "usage" in event:
                usage = event["usage"]
        except (json.JSONDecodeError, KeyError):
            continue
    return usage


LEAN_FLAGS = [
    "--disable", "apps",
    "--disable", "plugins",
    "--disable", "shell_tool",
    "--disable", "unified_exec",
    "--disable", "multi_agent",
]


def run_codex(prompt, stdin_text, search=False):
    """Run codex exec with a prompt and stdin, return (output_text, usage_dict)."""
    codex_path = shutil.which("codex")
    if not codex_path:
        raise RuntimeError("codex CLI not found on PATH")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as out_file:
        out_path = out_file.name

    try:
        cmd = [
            codex_path, "exec",
            "--skip-git-repo-check",
            "--json",
            "--ephemeral",
            "-s", "read-only",
            "-o", out_path,
            *LEAN_FLAGS,
        ]
        if search:
            cmd += ["-c", 'web_search="live"']
        cmd.append(prompt)

        result = subprocess.run(
            cmd,
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            raise RuntimeError(f"codex exec failed (exit {result.returncode}): {stderr}")

        with open(out_path, "r") as f:
            output_text = f.read().strip()

        usage = _parse_usage_from_jsonl(result.stdout)
        return output_text, usage
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def run_codex_with_images(prompt, stdin_text, image_paths, search=False):
    """Run codex exec with --image flags and stdin, return (output_text, usage_dict)."""
    codex_path = shutil.which("codex")
    if not codex_path:
        raise RuntimeError("codex CLI not found on PATH")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as out_file:
        out_path = out_file.name

    try:
        cmd = [
            codex_path, "exec",
            "--skip-git-repo-check",
            "--json",
            "--ephemeral",
            "-s", "read-only",
            "-o", out_path,
            *LEAN_FLAGS,
        ]
        if search:
            cmd += ["-c", 'web_search="live"']
        if image_paths:
            cmd += ["--image", ",".join(image_paths)]
        cmd.append(prompt)

        result = subprocess.run(
            cmd,
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            raise RuntimeError(f"codex exec failed (exit {result.returncode}): {stderr}")

        with open(out_path, "r") as f:
            output_text = f.read().strip()

        usage = _parse_usage_from_jsonl(result.stdout)
        return output_text, usage
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Visual analysis helpers
# ---------------------------------------------------------------------------

FRAME_WIDTH = 640
FRAME_HEIGHT = 360


def decode_frame(data_url):
    """Decode a data:image/png;base64,... string into a PIL Image."""
    header, b64data = data_url.split(",", 1)
    img_bytes = base64.b64decode(b64data)
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


def crop_frame(img, video_rect):
    """Crop a full-tab screenshot to just the video player area."""
    if not video_rect:
        return img

    dpr = video_rect.get("devicePixelRatio", 1)
    x = int(video_rect["x"] * dpr)
    y = int(video_rect["y"] * dpr)
    w = int(video_rect["width"] * dpr)
    h = int(video_rect["height"] * dpr)

    img_w, img_h = img.size
    x = max(0, min(x, img_w - 1))
    y = max(0, min(y, img_h - 1))
    w = min(w, img_w - x)
    h = min(h, img_h - y)

    if w < 10 or h < 10:
        return img

    return img.crop((x, y, x + w, y + h))


def frames_are_similar(img_a, img_b, threshold=0.05):
    """Compare two PIL images for near-identity using downscaled grayscale MAD."""
    size = (16, 16)
    a = img_a.resize(size).convert("L")
    b = img_b.resize(size).convert("L")
    pixels_a = list(a.getdata())
    pixels_b = list(b.getdata())
    diff = sum(abs(pa - pb) for pa, pb in zip(pixels_a, pixels_b))
    max_diff = 255 * len(pixels_a)
    return (diff / max_diff) < threshold


def deduplicate_frames(frames):
    """Remove consecutive near-duplicate frames. Each frame is (timestamp, PIL Image)."""
    if len(frames) <= 1:
        return frames
    result = [frames[0]]
    for i in range(1, len(frames)):
        if not frames_are_similar(result[-1][1], frames[i][1]):
            result.append(frames[i])
    return result


def pick_grid(n):
    """Pick (cols, rows) for a collage grid given n frames."""
    if n <= 2:
        return (n, 1)
    if n <= 4:
        return (2, 2)
    if n <= 6:
        return (2, 3)
    if n <= 9:
        return (3, 3)
    return (2, 5)


def build_collage(frames, start_idx=0):
    """Build a collage image from a list of (timestamp, PIL Image) tuples.
    Returns a PIL Image with timestamp overlays."""
    n = len(frames)
    cols, rows = pick_grid(n)

    thumb_w, thumb_h = FRAME_WIDTH, FRAME_HEIGHT
    collage = Image.new("RGB", (cols * thumb_w, rows * thumb_h), (20, 20, 30))
    draw = ImageDraw.Draw(collage)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 18)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 18)
        except (OSError, IOError):
            font = ImageFont.load_default()

    for i, (timestamp, img) in enumerate(frames):
        resized = img.resize((thumb_w, thumb_h), Image.LANCZOS)
        col = i % cols
        row = i // cols
        x_off = col * thumb_w
        y_off = row * thumb_h
        collage.paste(resized, (x_off, y_off))

        label = format_time(timestamp)
        tx, ty = x_off + 6, y_off + 4
        draw.rectangle([tx - 2, ty - 1, tx + 72, ty + 20], fill=(0, 0, 0, 180))
        draw.text((tx, ty), label, fill=(255, 255, 255), font=font)

    return collage


VISUAL_ANALYZE_PROMPT = """You are given visual frames and a transcript from a YouTube video segment.

Transcript ({start} to {end}):
{transcript}

The attached images are collages of video frames captured from this segment.
Each frame has a timestamp overlay in the top-left corner showing MM:SS.
Frames are arranged left-to-right, top-to-bottom in each collage.

{task}

IMPORTANT: Always respond in English, regardless of the language of the transcript.
Be detailed and reference specific timestamps when relevant."""


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

SEGMENTS_PROMPT = """You are given a timestamped YouTube transcript on stdin.
Identify the most important, information-dense segments and output them as time ranges.

Rules:
- Skip filler: intros, outros, sponsor reads, "like and subscribe", off-topic banter, repetitive recaps.
- Each segment should be a self-contained, meaningful chunk — a single topic, argument, or newsworthy moment.
- Prefer tighter segments (30s-3min each) over long loose ones.
- Timestamps MUST match the transcript's actual timestamps. Do not invent or approximate.
{budget_line}
{instructions_line}
Output ONLY a single line of comma-separated segments in MM:SS-MM:SS format.
Example: 1:02-3:15, 5:30-7:45, 10:12-12:00
No explanation, no markdown, no code blocks, no numbering — ONLY the raw comma-separated segments line."""

ASK_PROMPT = """You are given a timestamped YouTube transcript on stdin.
The user has a question about this video. Answer it based on the transcript content.
Be concise, accurate, and directly address the question.
If the answer isn't in the transcript, say so.
IMPORTANT: Always respond in English, regardless of the language of the transcript.

User's question: {question}"""

WEB_SEARCH_INSTRUCTION = """
You have access to web search. Use it to look up additional context, verify claims, \
find related information, or provide more comprehensive answers beyond what the transcript contains. \
Cite sources when using web results."""

SUMMARY_PROMPTS = {
    "detailed": """You are given a timestamped YouTube transcript on stdin.
Provide a detailed, comprehensive summary of the video. Cover all major topics discussed,
key arguments made, important facts and figures mentioned, and the overall narrative arc.
Organize the summary with clear sections. Include notable quotes where relevant.
Be thorough but well-structured.
IMPORTANT: Always write your response in English, regardless of the language of the transcript.""",

    "short": """You are given a timestamped YouTube transcript on stdin.
Provide a short, concise summary of the video in 3-5 sentences.
Capture only the most essential points — what is this video about, what are the 2-3 biggest
takeaways, and what is the conclusion. No filler, no section headers — just a tight paragraph.
IMPORTANT: Always write your response in English, regardless of the language of the transcript.""",

    "key-pointers": """You are given a timestamped YouTube transcript on stdin.
Extract all the key pointers and important points discussed in the video.
Do not include timestamps or time windows in the response.
For each pointer, provide a moderately detailed description of the point.

Format as a numbered list. Be comprehensive — capture every distinct important point,
argument, or piece of news discussed in the video. Include enough context that someone
can understand the point, but keep each item concise and avoid overly detailed explanations.
IMPORTANT: Always write your response in English, regardless of the language of the transcript.""",
}


# ---------------------------------------------------------------------------
# Chat sessions
# ---------------------------------------------------------------------------

CHAT_PROMPT = """You are a helpful assistant in a persistent chat about one YouTube video.

Current video title: {title}
Current turn mode: {mode}
Current transcript window: {window_label}

Recent conversation:
{history}

Current transcript context:
{transcript}

{visual_context}

User request:
{question}

Instructions:
- Answer in English.
- Use the current transcript context as the main source for this turn.
- Use prior conversation to understand follow-up references and avoid repeating yourself.
- If prior visual collages are attached, you may refer to them as visual context from earlier turns.
- If the selected transcript window does not contain the answer, say that clearly and explain whether prior context helps.
- Include timestamps when useful and when they are available in the context."""

SUMMARY_CHAT_REQUESTS = {
    "detailed": "Provide a detailed summary of the selected transcript window.",
    "short": "Provide a short 3-5 sentence summary of the selected transcript window.",
    "key-pointers": "Extract the key pointers from the selected transcript window as a concise numbered list.",
}


def _safe_id(value, fallback="item"):
    value = str(value or fallback)
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", value).strip("._")
    return cleaned[:120] or fallback


# Per-video lock guarding all session JSON file reads/writes for a given video.
# Coarse-grained (one lock per video, not per session) because a single user is
# typically working with one active session per video, and this avoids having
# to resolve a session id before we can safely serialize access.
_SESSION_FILE_LOCKS = {}
_SESSION_FILE_LOCKS_GUARD = threading.Lock()


def _session_file_lock(video_id):
    key = _safe_id(video_id, "video")
    with _SESSION_FILE_LOCKS_GUARD:
        lock = _SESSION_FILE_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _SESSION_FILE_LOCKS[key] = lock
        return lock


def _video_session_root(video_id):
    return os.path.join(SESSION_DIR, _safe_id(video_id, "video"))


def _active_session_path(video_id):
    return os.path.join(_video_session_root(video_id), "active.json")


def _session_json_path(video_id, session_id):
    return os.path.join(_video_session_root(video_id), "sessions", f"{_safe_id(session_id, 'session')}.json")


def _session_artifact_dir(video_id, session_id):
    return os.path.join(_video_session_root(video_id), "artifacts", _safe_id(session_id, "session"))


def _write_json_atomic(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.{uuid.uuid4().hex}.tmp"
    with open(tmp_path, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp_path, path)


def _read_json(path):
    with open(path, "r") as f:
        return json.load(f)


def _new_session(video_id, title=None):
    session_id = uuid.uuid4().hex
    now = time.time()
    session = {
        "videoId": video_id,
        "sessionId": session_id,
        "title": title or video_id,
        "createdAt": now,
        "updatedAt": now,
        "messages": [],
    }
    _save_session(session)
    return session


def _save_session(session):
    session["updatedAt"] = time.time()
    video_id = session["videoId"]
    session_id = session["sessionId"]
    _write_json_atomic(_session_json_path(video_id, session_id), session)
    _write_json_atomic(_active_session_path(video_id), {"sessionId": session_id, "updatedAt": session["updatedAt"]})


def _load_session(video_id, session_id):
    if not session_id:
        return None
    path = _session_json_path(video_id, session_id)
    if not os.path.exists(path):
        return None
    try:
        return _read_json(path)
    except (OSError, json.JSONDecodeError):
        return None


def _load_active_session(video_id):
    active_path = _active_session_path(video_id)
    if not os.path.exists(active_path):
        return None
    try:
        active = _read_json(active_path)
    except (OSError, json.JSONDecodeError):
        return None
    return _load_session(video_id, active.get("sessionId"))


def _get_or_create_session(video_id, session_id=None, title=None):
    session = _load_session(video_id, session_id) if session_id else _load_active_session(video_id)
    if session:
        if title and not session.get("title"):
            session["title"] = title
        return session
    return _new_session(video_id, title=title)


def _delete_active_session(video_id):
    session = _load_active_session(video_id)
    if not session:
        return _new_session(video_id)

    session_id = session["sessionId"]
    for path in (
        _session_json_path(video_id, session_id),
        _active_session_path(video_id),
    ):
        try:
            if os.path.exists(path):
                os.unlink(path)
        except OSError:
            pass

    artifact_dir = _session_artifact_dir(video_id, session_id)
    if os.path.isdir(artifact_dir):
        shutil.rmtree(artifact_dir, ignore_errors=True)

    return _new_session(video_id, title=session.get("title") or video_id)


def _cleanup_old_sessions():
    cutoff = time.time() - (SESSION_MAX_AGE_DAYS * 86400)
    if not os.path.isdir(SESSION_DIR):
        return
    for video_name in os.listdir(SESSION_DIR):
        video_root = os.path.join(SESSION_DIR, video_name)
        sessions_root = os.path.join(video_root, "sessions")
        if not os.path.isdir(sessions_root):
            continue
        for json_path in glob.glob(os.path.join(sessions_root, "*.json")):
            try:
                session = _read_json(json_path)
                updated_at = session.get("updatedAt") or os.path.getmtime(json_path)
                if updated_at >= cutoff:
                    continue
                session_id = session.get("sessionId") or os.path.splitext(os.path.basename(json_path))[0]
                os.unlink(json_path)
                shutil.rmtree(os.path.join(video_root, "artifacts", _safe_id(session_id, "session")), ignore_errors=True)
                active_path = os.path.join(video_root, "active.json")
                if os.path.exists(active_path):
                    active = _read_json(active_path)
                    if active.get("sessionId") == session_id:
                        os.unlink(active_path)
            except (OSError, json.JSONDecodeError):
                continue


def _public_session(session):
    def public_message(msg):
        out = dict(msg)
        out["artifacts"] = [
            {k: v for k, v in artifact.items() if k != "absPath"}
            for artifact in (msg.get("artifacts") or [])
        ]
        return out

    return {
        "videoId": session.get("videoId"),
        "sessionId": session.get("sessionId"),
        "title": session.get("title"),
        "createdAt": session.get("createdAt"),
        "updatedAt": session.get("updatedAt"),
        "messages": [public_message(msg) for msg in session.get("messages", [])],
    }


def _message(role, kind, text, status="done", context=None, usage=None, error=None, artifacts=None):
    data = {
        "id": uuid.uuid4().hex,
        "role": role,
        "kind": kind,
        "text": text or "",
        "createdAt": time.time(),
        "status": status,
        "context": context or {},
        "artifacts": artifacts or [],
    }
    if usage:
        data["usage"] = usage
    if error:
        data["error"] = error
    return data


def _format_window_label(start_time, end_time):
    if start_time is None and end_time is None:
        return "full video"
    start = format_time(start_time or 0)
    end = format_time(end_time or 0)
    return f"{start}-{end}"


def _history_text(messages, max_chars=CHAT_HISTORY_MAX_CHARS, max_messages=CHAT_HISTORY_MAX_MESSAGES):
    selected = [m for m in messages if m.get("role") in ("user", "assistant") and m.get("status") == "done"]
    selected = selected[-max_messages:]
    lines = []
    total = 0
    for msg in reversed(selected):
        text = (msg.get("text") or "").strip()
        if not text:
            continue
        context = msg.get("context") or {}
        label = msg.get("role", "message").capitalize()
        meta = []
        if context.get("usedVisual"):
            meta.append("visual")
        if context.get("webSearch"):
            meta.append("web search")
        if context.get("transcriptStart") is not None or context.get("transcriptEnd") is not None:
            meta.append(_format_window_label(context.get("transcriptStart"), context.get("transcriptEnd")))
        prefix = f"{label}"
        if meta:
            prefix += f" ({', '.join(meta)})"
        entry = f"{prefix}: {text}"
        if total + len(entry) > max_chars:
            break
        lines.append(entry)
        total += len(entry)
    return "\n\n".join(reversed(lines)) or "(No prior conversation.)"


def _prior_collage_paths(session, limit=CHAT_PRIOR_IMAGE_LIMIT):
    paths = []
    messages = list(session.get("messages", []))
    for msg in reversed(messages):
        for artifact in reversed(msg.get("artifacts") or []):
            if artifact.get("type") != "collage":
                continue
            abs_path = artifact.get("absPath")
            if abs_path and os.path.exists(abs_path):
                paths.append(abs_path)
            if len(paths) >= limit:
                return list(reversed(paths))
    return list(reversed(paths))


def _persist_chat_collages(video_id, session_id, turn_id, frames, batch_size=10):
    artifact_dir = _session_artifact_dir(video_id, session_id)
    os.makedirs(artifact_dir, exist_ok=True)
    artifacts = []
    image_paths = []
    for i in range(0, len(frames), batch_size):
        batch = frames[i:i + batch_size]
        collage = build_collage(batch, start_idx=i)
        filename = f"{_safe_id(turn_id, 'turn')}-collage-{len(artifacts) + 1:03d}.jpg"
        abs_path = os.path.join(artifact_dir, filename)
        collage.save(abs_path, format="JPEG", quality=85)
        timestamps = [timestamp for timestamp, _img in batch]
        artifact = {
            "type": "collage",
            "filename": filename,
            "absPath": abs_path,
            "url": f"/chat-artifact/{_safe_id(video_id, 'video')}/{_safe_id(session_id, 'session')}/{filename}",
            "frameCount": len(batch),
            "startTime": min(timestamps) if timestamps else None,
            "endTime": max(timestamps) if timestamps else None,
        }
        artifacts.append(artifact)
        image_paths.append(abs_path)
    return artifacts, image_paths


def _build_chat_prompt(title, mode, question, transcript_text, context, history, visual_note):
    return CHAT_PROMPT.format(
        title=title,
        mode=mode,
        window_label=_format_window_label(context.get("transcriptStart"), context.get("transcriptEnd")),
        history=history,
        transcript=transcript_text or "(Transcript not available.)",
        visual_context=visual_note,
        question=question,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def clean_segments_line(raw):
    raw = raw.strip().strip("`")
    for line in raw.split("\n"):
        line = line.strip().strip("`")
        if not line:
            continue
        if "-" in line and ":" in line:
            return line
    return raw.split("\n")[0].strip().strip("`") if raw else None


def _parse_timestamp_to_seconds(token):
    """Parse a timestamp like '1:23', '01:02:03', or '90' into seconds."""
    token = token.strip()
    if not token:
        return None
    if ":" not in token:
        try:
            return float(token)
        except ValueError:
            return None
    parts = token.split(":")
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return None
    if len(nums) == 2:
        return nums[0] * 60 + nums[1]
    if len(nums) == 3:
        return nums[0] * 3600 + nums[1] * 60 + nums[2]
    return None


def _format_duration(seconds):
    s = int(round(seconds))
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h > 0:
        return f"{h}:{m:02d}:{sec:02d}"
    return f"{m}:{sec:02d}"


def compute_segments_total(segments_line):
    """Parse a 'start-end, start-end' string and return (total_seconds, formatted)."""
    if not segments_line:
        return 0, "0:00"
    total = 0.0
    for piece in segments_line.split(","):
        piece = piece.strip()
        if not piece or "-" not in piece:
            continue
        start_str, _, end_str = piece.partition("-")
        start = _parse_timestamp_to_seconds(start_str)
        end = _parse_timestamp_to_seconds(end_str)
        if start is None or end is None or end <= start:
            continue
        total += end - start
    return total, _format_duration(total)


def _pcm_to_wav_bytes(pcm, channels=1, rate=24000, sample_width=2):
    """Wrap Gemini's raw LINEAR16 PCM response in a WAV container for browser playback."""
    if isinstance(pcm, str):
        pcm = base64.b64decode(pcm)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def _wav_bytes_to_pcm(wav_bytes):
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        params = wf.getparams()
        pcm = wf.readframes(wf.getnframes())
    return params, pcm


def _wav_bytes_duration(wav_bytes):
    params, pcm = _wav_bytes_to_pcm(wav_bytes)
    frame_count = len(pcm) / (params.nchannels * params.sampwidth)
    return frame_count / params.framerate if params.framerate else 0


def _combine_wav_chunks(wav_chunks):
    if not wav_chunks:
        raise ValueError("No TTS audio chunks generated")

    first_params, first_pcm = _wav_bytes_to_pcm(wav_chunks[0])
    pcm_parts = [first_pcm]
    for chunk in wav_chunks[1:]:
        params, pcm = _wav_bytes_to_pcm(chunk)
        if (
            params.nchannels != first_params.nchannels
            or params.sampwidth != first_params.sampwidth
            or params.framerate != first_params.framerate
        ):
            raise ValueError("TTS chunk audio formats did not match")
        pcm_parts.append(pcm)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(first_params.nchannels)
        wf.setsampwidth(first_params.sampwidth)
        wf.setframerate(first_params.framerate)
        wf.writeframes(b"".join(pcm_parts))
    return buf.getvalue()


def chunk_tts_text(text, target_chars=GEMINI_TTS_CHUNK_TARGET_CHARS, max_chars=GEMINI_TTS_CHUNK_MAX_CHARS):
    """Split text into Gemini TTS-sized chunks without cutting sentences unless necessary."""
    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    if not text:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks = []
    current = ""

    def split_oversized(piece):
        sentences = re.split(r"(?<=[.!?])\s+", piece.strip())
        result = []
        buf = ""
        for sentence in sentences:
            if len(sentence) > max_chars:
                if buf:
                    result.append(buf.strip())
                    buf = ""
                for i in range(0, len(sentence), max_chars):
                    result.append(sentence[i:i + max_chars].strip())
                continue
            candidate = f"{buf} {sentence}".strip() if buf else sentence
            if len(candidate) <= max_chars:
                buf = candidate
            else:
                result.append(buf.strip())
                buf = sentence
        if buf:
            result.append(buf.strip())
        return result

    for paragraph in paragraphs:
        pieces = split_oversized(paragraph) if len(paragraph) > max_chars else [paragraph]
        for piece in pieces:
            sep = "\n\n" if current else ""
            candidate = f"{current}{sep}{piece}" if current else piece
            if len(candidate) <= target_chars or not current:
                current = candidate
                continue
            chunks.append(current.strip())
            current = piece

    if current:
        chunks.append(current.strip())
    return chunks


def generate_gemini_tts_audio(text, voice_name=None):
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set. Add it to .env or your shell environment.")

    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise RuntimeError("google-genai is not installed. Run: pip install -r requirements.txt") from e

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=GEMINI_TTS_MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=voice_name or GEMINI_TTS_DEFAULT_VOICE,
                    )
                )
            )
        ),
    )

    pcm = response.candidates[0].content.parts[0].inline_data.data
    return _pcm_to_wav_bytes(pcm)


def _resolve_repo_relative_path(value, repo_path):
    if not value or not str(value).strip():
        return ""
    path = Path(str(value)).expanduser()
    if not path.is_absolute():
        path = repo_path / path
    return str(path)


def generate_qwen_mlx_tts_audio(text, voice_name=None, instruction=None):
    repo_path = Path(QWEN_TTS_REPO).expanduser()
    config_path = Path(QWEN_TTS_CONFIG).expanduser()
    if not repo_path.exists():
        raise RuntimeError(f"Qwen TTS repo not found: {repo_path}")
    if not config_path.exists():
        raise RuntimeError(f"Qwen TTS config not found: {config_path}")
    if str(repo_path) not in sys.path:
        sys.path.insert(0, str(repo_path))

    try:
        from talking_head.audio import generate_speech_audio
        from talking_head.config import load_config
    except ImportError as e:
        raise RuntimeError(
            f"talking_head import failed: {e}. Set QWEN_TTS_REPO to the talking-head repo path "
            "and install talking-head dependencies in the server venv."
        ) from e

    try:
        app_config = load_config(config_path)
        tools = app_config.tools
        repo_model = _resolve_repo_relative_path(tools.qwen_model, repo_path)
        repo_ref_audio = _resolve_repo_relative_path(tools.qwen_ref_audio, repo_path)
        tools = replace(
            tools,
            tts_backend="qwen_mlx",
            qwen_model=repo_model,
            qwen_voice=voice_name or QWEN_TTS_DEFAULT_VOICE,
            qwen_instruct=instruction or QWEN_TTS_DEFAULT_INSTRUCT,
            qwen_ref_audio=repo_ref_audio,
        )
        with tempfile.TemporaryDirectory(prefix="video-extension-qwen-") as tmp:
            output_path = Path(tmp) / "speech.wav"
            generate_speech_audio(text, output_path, tools)
            return output_path.read_bytes()
    except Exception as e:
        raise RuntimeError(f"Qwen MLX TTS failed: {e}") from e


def _normalize_tts_provider(provider):
    provider = (provider or "gemini").strip().lower()
    if provider in ("gemini", "google", "google_gemini"):
        return "gemini"
    if provider in ("qwen", "qwen_mlx", "qwen-mlx", "talking_head", "talking-head"):
        return QWEN_TTS_PROVIDER
    return None


def _tts_provider_model(provider):
    return QWEN_TTS_MODEL if provider == QWEN_TTS_PROVIDER else GEMINI_TTS_MODEL


def _tts_provider_default_voice(provider):
    return QWEN_TTS_DEFAULT_VOICE if provider == QWEN_TTS_PROVIDER else GEMINI_TTS_DEFAULT_VOICE


def _tts_provider_max_chars(provider):
    return QWEN_TTS_MAX_CHARS if provider == QWEN_TTS_PROVIDER else GEMINI_TTS_MAX_CHARS


def _tts_provider_chunk_target(provider):
    return QWEN_TTS_CHUNK_TARGET_CHARS if provider == QWEN_TTS_PROVIDER else GEMINI_TTS_CHUNK_TARGET_CHARS


def _tts_provider_chunk_max(provider):
    return QWEN_TTS_CHUNK_MAX_CHARS if provider == QWEN_TTS_PROVIDER else GEMINI_TTS_CHUNK_MAX_CHARS


def generate_tts_audio_for_provider(provider, text, voice_name=None, instruction=None):
    if provider == QWEN_TTS_PROVIDER:
        return generate_qwen_mlx_tts_audio(text, voice_name=voice_name, instruction=instruction)
    return generate_gemini_tts_audio(text, voice_name=voice_name)


def _qwen_batch_python():
    configured = Path(QWEN_TTS_PYTHON).expanduser()
    if configured.exists():
        return str(configured)
    return sys.executable


def _qwen_batch_chunks_json_path(job_id):
    return os.path.join(TTS_JOB_DIR, f"{job_id}_qwen_chunks.json")


def _qwen_batch_output_dir(job_id):
    return os.path.join(TTS_JOB_DIR, f"{job_id}_qwen_chunks")


def _run_qwen_mlx_batch_job(job_id):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
    if not job:
        return

    repo_path = Path(QWEN_TTS_REPO).expanduser()
    config_path = Path(QWEN_TTS_CONFIG).expanduser()
    chunks = job["chunks"]
    missing_chunks = [
        {"index": index, "text": chunk}
        for index, chunk in enumerate(chunks, start=1)
        if index > job.get("chunksDone", 0)
    ]
    if not missing_chunks:
        return

    chunks_json_path = _qwen_batch_chunks_json_path(job_id)
    with open(chunks_json_path, "w") as f:
        json.dump({"chunks": missing_chunks}, f)
    output_dir = _qwen_batch_output_dir(job_id)
    os.makedirs(output_dir, exist_ok=True)

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(repo_path) if not existing_pythonpath else f"{repo_path}{os.pathsep}{existing_pythonpath}"

    cmd = [
        _qwen_batch_python(),
        "-m",
        "talking_head.qwen_chunks",
        "--chunks-json",
        chunks_json_path,
        "--output-dir",
        output_dir,
        "--config",
        str(config_path),
        "--voice",
        job["voiceName"],
        "--instruction",
        job.get("instruction") or QWEN_TTS_DEFAULT_INSTRUCT,
    ]

    process = subprocess.Popen(
        cmd,
        cwd=str(repo_path),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    stderr_lines = []
    stderr_thread = threading.Thread(target=_collect_process_stderr, args=(process, stderr_lines), daemon=True)
    stderr_thread.start()
    _set_tts_job(job_id, qwen_process=process)

    try:
        assert process.stdout is not None
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                app.logger.warning("ignoring non-json qwen batch stdout: %s", line)
                continue

            with TTS_JOBS_LOCK:
                job = TTS_JOBS.get(job_id)
                if not job:
                    _terminate_process(process)
                    return
                was_cancelled = job["cancel_event"].is_set()
            if was_cancelled:
                _terminate_process(process)
                _set_tts_job(job_id, status="cancelled", finishedAt=time.time(), message="Cancelled")
                return

            event_type = event.get("event")
            if event_type == "started":
                _set_tts_job(job_id, status="running", message=f"Generating 0/{len(chunks)} chunks")
            elif event_type == "chunk_started":
                chunk_index = int(event.get("chunkIndex") or 0)
                _set_tts_job(
                    job_id,
                    currentChunk=chunk_index,
                    currentChunkChars=int(event.get("chars") or 0),
                    message=f"Generating chunk {chunk_index}/{len(chunks)}",
                )
            elif event_type == "chunk_done":
                _record_qwen_batch_chunk_done(job_id, event, len(chunks))
            elif event_type == "error":
                _terminate_process(process)
                raise RuntimeError(event.get("message") or "Qwen batch generation failed")

        return_code = process.wait()
        stderr_thread.join(timeout=1)
        if return_code != 0:
            with TTS_JOBS_LOCK:
                job = TTS_JOBS.get(job_id)
                was_cancelled = bool(job and job["cancel_event"].is_set())
            if was_cancelled:
                _set_tts_job(job_id, status="cancelled", finishedAt=time.time(), message="Cancelled")
                return
            details = "\n".join(stderr_lines[-20:]).strip()
            raise RuntimeError(details or f"Qwen batch generation exited with code {return_code}")
    finally:
        _set_tts_job(job_id, qwen_process=None)


def _collect_process_stderr(process, stderr_lines):
    if process.stderr is None:
        return
    for line in process.stderr:
        stderr_lines.append(line.rstrip())


def _terminate_process(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def _record_qwen_batch_chunk_done(job_id, event, total_chunks):
    chunk_index = int(event["chunkIndex"])
    chunk_path = event["path"]
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
        if not job:
            return
        chunk_paths = list(job.get("chunk_audio_paths", []))
        chunk_paths[chunk_index - 1] = chunk_path
        chunk_durations = list(job.get("chunkTimings", []))
        chunk_durations.append({
            "chunkIndex": chunk_index,
            "chars": int(event.get("chars") or 0),
            "elapsedSeconds": round(float(event.get("elapsedSeconds") or 0), 2),
            "audioSeconds": round(float(event.get("audioSeconds") or 0), 2),
        })
    _set_tts_job(
        job_id,
        chunksDone=chunk_index,
        chunksReady=chunk_index,
        chunk_audio_paths=chunk_paths,
        chunkTimings=chunk_durations,
        message=f"Generated chunk {chunk_index}/{total_chunks}",
    )


def _validate_tts_provider_request(provider):
    if provider == "gemini" and not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        return "GEMINI_API_KEY is not set. Paste your Google AI Studio key into .env."
    if provider == QWEN_TTS_PROVIDER:
        repo_path = Path(QWEN_TTS_REPO).expanduser()
        config_path = Path(QWEN_TTS_CONFIG).expanduser()
        if not repo_path.exists():
            return f"Qwen TTS repo not found: {repo_path}. Set QWEN_TTS_REPO in .env."
        if not config_path.exists():
            return f"Qwen TTS config not found: {config_path}. Set QWEN_TTS_CONFIG in .env."
    return None


def _retry_delay_seconds(e):
    response_json = getattr(e, "response_json", None)
    if isinstance(response_json, dict):
        for detail in response_json.get("error", {}).get("details", []):
            retry_delay = detail.get("retryDelay")
            if isinstance(retry_delay, str):
                try:
                    return float(retry_delay.rstrip("s"))
                except ValueError:
                    pass

    text = str(e)
    match = re.search(r"retry(?:Delay| in)?['\": ]+([0-9.]+)s", text, re.IGNORECASE)
    if match:
        return float(match.group(1))
    match = re.search(r"Please retry in ([0-9.]+)s", text, re.IGNORECASE)
    if match:
        return float(match.group(1))
    return None


def _error_status_code(e):
    status_code = getattr(e, "status_code", None)
    if status_code is not None:
        try:
            return int(status_code)
        except (TypeError, ValueError):
            pass

    response_json = getattr(e, "response_json", None)
    if isinstance(response_json, dict):
        code = response_json.get("error", {}).get("code")
        if code is not None:
            try:
                return int(code)
            except (TypeError, ValueError):
                pass

    text = str(e)
    match = re.search(r"\b(429|500|502|503|504)\b", text)
    if match:
        return int(match.group(1))
    if "RESOURCE_EXHAUSTED" in text:
        return 429
    return None


TTS_JOBS = {}
TTS_JOBS_LOCK = threading.Lock()
TTS_SEMAPHORES = {
    "gemini": threading.Semaphore(GEMINI_TTS_CONCURRENCY),
    QWEN_TTS_PROVIDER: threading.Semaphore(QWEN_TTS_CONCURRENCY),
}

TTS_JOB_CONDITIONS = {}
TTS_JOB_CONDITIONS_LOCK = threading.Lock()


def _job_condition(job_id):
    with TTS_JOB_CONDITIONS_LOCK:
        cond = TTS_JOB_CONDITIONS.get(job_id)
        if cond is None:
            cond = threading.Condition()
            TTS_JOB_CONDITIONS[job_id] = cond
        return cond


def _drop_job_condition(job_id):
    with TTS_JOB_CONDITIONS_LOCK:
        TTS_JOB_CONDITIONS.pop(job_id, None)


def _tts_chunk_audio_path(job_id, chunk_index):
    return os.path.join(TTS_JOB_DIR, f"{job_id}_chunk_{chunk_index}.wav")


def _tts_job_meta_path(job_id):
    return os.path.join(TTS_JOB_DIR, f"{job_id}.json")


def _serializable_tts_job(job):
    data = {k: v for k, v in job.items() if k not in ("cancel_event", "qwen_process")}
    return data


def _persist_tts_job(job):
    try:
        with open(_tts_job_meta_path(job["jobId"]), "w") as f:
            json.dump(_serializable_tts_job(job), f)
    except OSError:
        app.logger.exception("failed to persist tts job metadata")


def _load_tts_job(job_id):
    path = _tts_job_meta_path(job_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            job = json.load(f)
        job["cancel_event"] = threading.Event()
        with TTS_JOBS_LOCK:
            TTS_JOBS[job_id] = job
        if job.get("status") in ("queued", "running"):
            threading.Thread(target=_run_tts_job, args=(job_id,), daemon=True).start()
        return job
    except (OSError, json.JSONDecodeError):
        return None


def _public_tts_job(job):
    public = {k: v for k, v in job.items() if k not in ("cancel_event", "qwen_process", "audio_path", "chunks", "chunk_audio_paths")}
    public["audioReady"] = bool(job.get("audio_path") and os.path.exists(job["audio_path"]))
    public["chunkAudioReady"] = [
        i + 1
        for i, path in enumerate(job.get("chunk_audio_paths", []))
        if path and os.path.exists(path)
    ]
    public["provider"] = job.get("provider", "gemini")
    public["concurrency"] = QWEN_TTS_CONCURRENCY if public["provider"] == QWEN_TTS_PROVIDER else GEMINI_TTS_CONCURRENCY
    return public


def _set_tts_job(job_id, **updates):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
        if not job:
            return None
        job.update(updates)
        _persist_tts_job(job)
        snapshot = dict(job)
    cond = _job_condition(job_id)
    with cond:
        cond.notify_all()
    if snapshot.get("chatBinding"):
        try:
            _sync_chat_message_audio(snapshot)
        except Exception:
            app.logger.exception("failed to sync chat message audio")
    return snapshot


def _public_audio_state(job):
    # Note: intentionally excludes any wall-clock timestamp so identity comparisons
    # in _sync_chat_message_audio don't trigger spurious session rewrites on every
    # TTS state tick.
    return {
        "jobId": job.get("jobId"),
        "status": job.get("status"),
        "provider": job.get("provider", "gemini"),
        "voice": job.get("voiceName"),
        "chunksTotal": job.get("chunksTotal", 0),
        "chunksReady": job.get("chunksReady", 0),
        "chunksDone": job.get("chunksDone", 0),
        "durationSec": job.get("audioSeconds"),
        "error": (job.get("error") or {}).get("message") if job.get("error") else None,
        "errorType": (job.get("error") or {}).get("type") if job.get("error") else None,
    }


def _sync_chat_message_audio(job):
    binding = job.get("chatBinding") or {}
    video_id = binding.get("videoId")
    session_id = binding.get("sessionId")
    message_id = binding.get("messageId")
    if not (video_id and session_id and message_id):
        return
    with _session_file_lock(video_id):
        session = _load_session(video_id, session_id)
        if not session:
            return
        changed = False
        for msg in session.get("messages", []):
            if msg.get("id") != message_id:
                continue
            new_state = _public_audio_state(job)
            if msg.get("audio") != new_state:
                msg["audio"] = new_state
                changed = True
            break
        if changed:
            _save_session(session)


def _cleanup_tts_jobs(max_age_seconds=6 * 3600):
    cutoff = time.time() - max_age_seconds
    with TTS_JOBS_LOCK:
        stale_ids = [
            job_id for job_id, job in TTS_JOBS.items()
            if job.get("finishedAt") and job["finishedAt"] < cutoff
        ]
        for job_id in stale_ids:
            paths = [TTS_JOBS[job_id].get("audio_path")]
            paths += TTS_JOBS[job_id].get("chunk_audio_paths", [])
            paths.append(_tts_job_meta_path(job_id))
            paths.append(_qwen_batch_chunks_json_path(job_id))
            for path in paths:
                if not path:
                    continue
                try:
                    os.unlink(path)
                except OSError:
                    pass
            try:
                shutil.rmtree(_qwen_batch_output_dir(job_id))
            except OSError:
                pass
            TTS_JOBS.pop(job_id, None)
            _drop_job_condition(job_id)


def _tts_error_payload(e, chunk_index=None, provider="gemini"):
    status_code = _error_status_code(e)
    error_type = "qwen_generation_error" if provider == QWEN_TTS_PROVIDER else "gemini_error"
    retryable = False
    retry_after = None

    if provider == QWEN_TTS_PROVIDER:
        text = str(e)
        if "mlx-audio is not installed" in text or "No module named" in text:
            error_type = "qwen_dependency_error"
        elif "model path" in text or "model not found" in text or "repo not found" in text or "config not found" in text:
            error_type = "qwen_config_error"
        else:
            error_type = "qwen_generation_error"
        message = text
    elif status_code == 429:
        error_type = "rate_limited"
        retryable = True
        retry_after = _retry_delay_seconds(e)
        message = "Gemini TTS free-tier quota was exceeded."
        if retry_after:
            message += f" Retry after about {int(retry_after)} seconds."
    elif status_code is not None and int(status_code) >= 500:
        error_type = "transient_gemini_error"
        retryable = True
        message = str(e)
    elif "GEMINI_API_KEY" in str(e) or "API key" in str(e):
        error_type = "auth_error"
        message = str(e)
    else:
        message = str(e)

    return {
        "type": error_type,
        "message": message,
        "retryable": retryable,
        "retryAfterSeconds": retry_after,
        "chunkIndex": chunk_index,
    }


def _run_tts_job(job_id):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
    if not job:
        return

    chunks = job["chunks"]
    provider = job.get("provider", "gemini")
    semaphore = TTS_SEMAPHORES.get(provider, TTS_SEMAPHORES["gemini"])
    acquired = False

    try:
        if job["cancel_event"].is_set():
            _set_tts_job(job_id, status="cancelled", finishedAt=time.time(), message="Cancelled")
            return

        _set_tts_job(job_id, status="queued", message="Queued")
        semaphore.acquire()
        acquired = True

        if job["cancel_event"].is_set():
            _set_tts_job(job_id, status="cancelled", finishedAt=time.time(), message="Cancelled")
            return

        if not job.get("startedAt"):
            _set_tts_job(job_id, startedAt=time.time())
        _set_tts_job(job_id, status="running")

        if provider == QWEN_TTS_PROVIDER:
            _run_qwen_mlx_batch_job(job_id)
            with TTS_JOBS_LOCK:
                job = TTS_JOBS.get(job_id)
                if not job:
                    return
                was_cancelled = job["cancel_event"].is_set() or job.get("status") == "cancelled"
            if was_cancelled:
                _set_tts_job(job_id, status="cancelled", finishedAt=time.time(), message="Cancelled")
                return
        else:
            for index, chunk in enumerate(chunks, start=1):
                with TTS_JOBS_LOCK:
                    job = TTS_JOBS.get(job_id)
                    if not job:
                        return
                    if index <= job.get("chunksDone", 0):
                        continue

                if job["cancel_event"].is_set():
                    _set_tts_job(job_id, status="cancelled", finishedAt=time.time(), message="Cancelled")
                    return

                _set_tts_job(
                    job_id,
                    currentChunk=index,
                    message=f"Generating chunk {index}/{len(chunks)}",
                    currentChunkChars=len(chunk),
                )
                started = time.perf_counter()
                _set_tts_job(job_id, status="running", message=f"Generating chunk {index}/{len(chunks)}")
                wav_bytes = generate_tts_audio_for_provider(
                    provider,
                    chunk,
                    voice_name=job["voiceName"],
                    instruction=job.get("instruction"),
                )
                chunk_path = _tts_chunk_audio_path(job_id, index)
                with open(chunk_path, "wb") as f:
                    f.write(wav_bytes)

                with TTS_JOBS_LOCK:
                    job = TTS_JOBS.get(job_id)
                    if not job:
                        return
                    chunk_paths = list(job.get("chunk_audio_paths", []))
                    chunk_paths[index - 1] = chunk_path
                    chunk_durations = list(job.get("chunkTimings", []))
                    chunk_durations.append({
                        "chunkIndex": index,
                        "chars": len(chunk),
                        "elapsedSeconds": round(time.perf_counter() - started, 2),
                        "audioSeconds": round(_wav_bytes_duration(wav_bytes), 2),
                    })

                _set_tts_job(
                    job_id,
                    chunksDone=index,
                    chunksReady=index,
                    chunk_audio_paths=chunk_paths,
                    chunkTimings=chunk_durations,
                    message=f"Generated chunk {index}/{len(chunks)}",
                )

        with TTS_JOBS_LOCK:
            job = TTS_JOBS.get(job_id)
            if not job:
                return
            chunk_paths = job.get("chunk_audio_paths", [])
        wav_chunks = []
        for index, path in enumerate(chunk_paths, start=1):
            if not path or not os.path.exists(path):
                raise RuntimeError(f"Missing generated audio for chunk {index}")
            with open(path, "rb") as f:
                wav_chunks.append(f.read())

        combined = _combine_wav_chunks(wav_chunks)
        audio_path = os.path.join(TTS_JOB_DIR, f"{job_id}.wav")
        with open(audio_path, "wb") as f:
            f.write(combined)

        _set_tts_job(
            job_id,
            status="done",
            audio_path=audio_path,
            outputBytes=len(combined),
            audioSeconds=round(_wav_bytes_duration(combined), 2),
            finishedAt=time.time(),
            message="Speech ready",
        )
    except Exception as e:
        app.logger.exception("tts job failed")
        with TTS_JOBS_LOCK:
            job = TTS_JOBS.get(job_id)
            chunk_index = job.get("currentChunk") if job else None
        _set_tts_job(
            job_id,
            status="error",
            error=_tts_error_payload(e, chunk_index=chunk_index, provider=job.get("provider", "gemini") if job else "gemini"),
            finishedAt=time.time(),
            message="Speech generation failed",
        )
    finally:
        if acquired:
            semaphore.release()


@app.route("/chat-session", methods=["GET"])
def get_chat_session():
    video_id = request.args.get("videoId")
    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    _cleanup_old_sessions()
    with _session_file_lock(video_id):
        session = _get_or_create_session(video_id)
        return jsonify({"session": _public_session(session)})


@app.route("/chat-session/new", methods=["POST"])
def new_chat_session():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    title = body.get("title")
    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    _cleanup_old_sessions()
    with _session_file_lock(video_id):
        session = _delete_active_session(video_id)
        if title:
            session["title"] = title
            _save_session(session)
        return jsonify({"session": _public_session(session)})


@app.route("/chat-artifact/<video_id>/<session_id>/<filename>", methods=["GET"])
def get_chat_artifact(video_id, session_id, filename):
    video_id = _safe_id(video_id, "video")
    session_id = _safe_id(session_id, "session")
    filename = _safe_id(filename, "artifact.jpg")
    artifact_dir = _session_artifact_dir(video_id, session_id)
    path = os.path.join(artifact_dir, filename)
    if not os.path.exists(path):
        return jsonify({"error": "artifact not found"}), 404
    return send_file(path, mimetype="image/jpeg", as_attachment=False, download_name=filename)


@app.route("/chat", methods=["POST"])
def chat():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    session_id = body.get("sessionId")
    question = (body.get("question") or "").strip()
    mode = body.get("mode") or "text"
    context = body.get("context") or {}
    web_search = bool(body.get("webSearch", False))
    raw_frames = body.get("frames") or []
    video_rect = body.get("videoRect")
    do_dedup = body.get("deduplicate", True)

    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    if mode == "summary":
        summary_type = body.get("summaryType", "detailed")
        question = SUMMARY_CHAT_REQUESTS.get(summary_type, SUMMARY_CHAT_REQUESTS["detailed"])
    if not question:
        return jsonify({"error": "question is required"}), 400

    _cleanup_old_sessions()
    with _session_file_lock(video_id):
        session = _get_or_create_session(video_id, session_id)
        start_time = context.get("transcriptStart")
        end_time = context.get("transcriptEnd")
        visual_start = context.get("visualStart", start_time)
        visual_end = context.get("visualEnd", end_time)
        turn_context = {
            "transcriptStart": start_time,
            "transcriptEnd": end_time,
            "visualStart": visual_start,
            "visualEnd": visual_end,
            "usedVisual": bool(raw_frames) or mode == "visual",
            "webSearch": web_search,
        }

        user_msg = _message("user", mode, question, context=turn_context)
        session.setdefault("messages", []).append(user_msg)
        _save_session(session)

        artifacts = []
        current_image_paths = []
        try:
            title = session.get("title") or video_id
            try:
                transcript_text, fetched_title = get_transcript_text(video_id, start_time=start_time, end_time=end_time)
                title = fetched_title or title
                session["title"] = title
            except Exception:
                transcript_text = "(Transcript not available for this selected window.)"

            if raw_frames:
                frames = []
                for f in raw_frames:
                    img = decode_frame(f["dataUrl"])
                    img = crop_frame(img, video_rect)
                    frames.append((f["timestamp"], img))
                if do_dedup:
                    frames = deduplicate_frames(frames)
                if not frames:
                    dedup_error = "All frames were duplicates — nothing to analyze."
                    assistant_msg = _message(
                        "assistant",
                        mode,
                        "",
                        status="error",
                        context=turn_context,
                        error=dedup_error,
                        artifacts=[],
                    )
                    session.setdefault("messages", []).append(assistant_msg)
                    _save_session(session)
                    return jsonify({"error": dedup_error, "session": _public_session(session)}), 400
                turn_context["frameCount"] = len(frames)
                artifacts, current_image_paths = _persist_chat_collages(
                    video_id, session["sessionId"], user_msg["id"], frames
                )

            prior_image_paths = [] if current_image_paths else _prior_collage_paths(session)
            image_paths = current_image_paths + prior_image_paths
            if current_image_paths:
                visual_note = (
                    "Current turn includes newly captured visual collages. "
                    "Use them together with the transcript."
                )
            elif prior_image_paths:
                visual_note = (
                    "Attached images are persisted visual collages from earlier turns in this session. "
                    "Use them only when the user's follow-up appears to refer to prior visual context."
                )
            else:
                visual_note = "No visual images are attached for this turn."

            history = _history_text(session.get("messages", [])[:-1])
            prompt = _build_chat_prompt(title, mode, question, transcript_text, turn_context, history, visual_note)
            if web_search:
                prompt += WEB_SEARCH_INSTRUCTION

            if image_paths:
                answer, usage = run_codex_with_images(prompt, transcript_text, image_paths, search=web_search)
            else:
                answer, usage = run_codex(prompt, transcript_text, search=web_search)

            assistant_msg = _message(
                "assistant",
                mode,
                answer,
                context=turn_context,
                usage=usage,
                artifacts=artifacts,
            )
            session.setdefault("messages", []).append(assistant_msg)
            _save_session(session)
            return jsonify({
                "answer": answer,
                "title": title,
                "usage": usage,
                "session": _public_session(session),
                "message": _public_session({"messages": [assistant_msg]}).get("messages", [assistant_msg])[0],
            })
        except Exception as e:
            app.logger.exception("chat failed")
            assistant_msg = _message(
                "assistant",
                mode,
                "",
                status="error",
                context=turn_context,
                error=str(e),
                artifacts=artifacts,
            )
            session.setdefault("messages", []).append(assistant_msg)
            _save_session(session)
            return jsonify({"error": f"Chat failed: {e}", "session": _public_session(session)}), 500


@app.route("/generate-segments", methods=["POST"])
def generate_segments():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    max_minutes = body.get("maxMinutes")
    instructions = body.get("instructions", "")

    if not video_id:
        return jsonify({"error": "videoId is required"}), 400

    try:
        transcript_text, title = get_transcript_text(video_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to fetch transcript: {e}"}), 502

    budget_line = ""
    if max_minutes:
        budget_line = f"Max total runtime: {max_minutes} minutes. The sum of all segment durations must not exceed this."
    instructions_line = ""
    if instructions:
        instructions_line = f"Additional instructions: {instructions}"

    prompt = SEGMENTS_PROMPT.format(budget_line=budget_line, instructions_line=instructions_line)
    try:
        codex_output, usage = run_codex(prompt, transcript_text)
    except Exception as e:
        return jsonify({"error": f"Codex CLI failed: {e}"}), 502

    segments_line = clean_segments_line(codex_output)
    total_seconds, total_formatted = compute_segments_total(segments_line)

    return jsonify({
        "extensionInput": segments_line,
        "details": codex_output,
        "title": title,
        "usage": usage,
        "totalSeconds": total_seconds,
        "totalFormatted": total_formatted,
    })


@app.route("/ask", methods=["POST"])
def ask_about_video():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    question = body.get("question", "").strip()
    start_time = body.get("startTime")
    end_time = body.get("endTime")
    web_search = body.get("webSearch", False)

    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    if not question:
        return jsonify({"error": "question is required"}), 400

    try:
        transcript_text, title = get_transcript_text(video_id, start_time=start_time, end_time=end_time)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to fetch transcript: {e}"}), 502

    prompt = ASK_PROMPT.format(question=question)
    if web_search:
        prompt += WEB_SEARCH_INSTRUCTION
    try:
        answer, usage = run_codex(prompt, transcript_text, search=web_search)
    except Exception as e:
        return jsonify({"error": f"Codex CLI failed: {e}"}), 502

    return jsonify({"answer": answer, "title": title, "usage": usage})


@app.route("/summary", methods=["POST"])
def summarize_video():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    summary_type = body.get("type", "detailed")
    start_time = body.get("startTime")
    end_time = body.get("endTime")

    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    if summary_type not in SUMMARY_PROMPTS:
        return jsonify({"error": f"Invalid type. Use: {', '.join(SUMMARY_PROMPTS.keys())}"}), 400

    try:
        transcript_text, title = get_transcript_text(video_id, start_time=start_time, end_time=end_time)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to fetch transcript: {e}"}), 502

    prompt = SUMMARY_PROMPTS[summary_type]
    try:
        result, usage = run_codex(prompt, transcript_text)
    except Exception as e:
        return jsonify({"error": f"Codex CLI failed: {e}"}), 502

    return jsonify({"summary": result, "title": title, "usage": usage})


@app.route("/visual-analyze", methods=["POST"])
def visual_analyze():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    raw_frames = body.get("frames", [])
    video_rect = body.get("videoRect")
    start_time = body.get("startTime", 0)
    end_time = body.get("endTime", 0)
    do_dedup = body.get("deduplicate", True)
    question = body.get("question")
    web_search = body.get("webSearch", False)

    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    if not raw_frames:
        return jsonify({"error": "No frames provided"}), 400

    try:
        frames = []
        for f in raw_frames:
            img = decode_frame(f["dataUrl"])
            img = crop_frame(img, video_rect)
            frames.append((f["timestamp"], img))

        if do_dedup:
            before = len(frames)
            frames = deduplicate_frames(frames)
            app.logger.info(f"Dedup: {before} -> {len(frames)} frames")

        if not frames:
            return jsonify({"error": "All frames were duplicates — nothing to analyze."}), 400

        collage_batch_size = 10
        collages = []
        for i in range(0, len(frames), collage_batch_size):
            batch = frames[i:i + collage_batch_size]
            collages.append(build_collage(batch, start_idx=i))

        temp_paths = []
        try:
            for idx, collage_img in enumerate(collages):
                tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                collage_img.save(tmp.name, format="JPEG", quality=85)
                temp_paths.append(tmp.name)
                tmp.close()

            try:
                transcript_text, title = get_transcript_text(
                    video_id, start_time=start_time, end_time=end_time
                )
            except Exception:
                transcript_text = "(Transcript not available for this segment)"
                title = video_id

            if question:
                task = f"User's question: {question}"
            else:
                task = (
                    "Provide a detailed visual analysis of this video segment. "
                    "Describe what is shown on screen, any diagrams, code, text, "
                    "slides, or visual elements. Note any changes between frames."
                )

            prompt = VISUAL_ANALYZE_PROMPT.format(
                start=format_time(start_time),
                end=format_time(end_time),
                transcript=transcript_text,
                task=task,
            )
            if web_search:
                prompt += WEB_SEARCH_INSTRUCTION

            result, usage = run_codex_with_images(prompt, transcript_text, temp_paths, search=web_search)
        finally:
            for p in temp_paths:
                try:
                    os.unlink(p)
                except OSError:
                    pass

        return jsonify({"answer": result, "title": title, "framesAnalyzed": len(frames), "usage": usage})

    except Exception as e:
        app.logger.exception("visual-analyze failed")
        return jsonify({"error": f"Visual analysis failed: {e}"}), 500


@app.route("/tts", methods=["POST"])
def text_to_speech():
    body = request.get_json(force=True)
    text = body.get("text", "").strip()
    provider = _normalize_tts_provider(body.get("provider", "gemini"))
    if not provider:
        return jsonify({"error": "unsupported TTS provider"}), 400
    voice_name = body.get("voiceName") or _tts_provider_default_voice(provider)
    instruction = body.get("instruction") or None

    if not text:
        return jsonify({"error": "text is required"}), 400
    provider_error = _validate_tts_provider_request(provider)
    if provider_error:
        return jsonify({"error": provider_error}), 400

    truncated = False
    max_chars = _tts_provider_max_chars(provider)
    if len(text) > max_chars:
        text = text[:max_chars].rstrip()
        truncated = True

    try:
        wav_bytes = generate_tts_audio_for_provider(provider, text, voice_name=voice_name, instruction=instruction)
    except Exception as e:
        app.logger.exception("tts failed")
        label = "Qwen MLX TTS" if provider == QWEN_TTS_PROVIDER else "Gemini TTS"
        return jsonify({"error": f"{label} failed: {e}"}), 502

    payload = {
        "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
        "mimeType": "audio/wav",
        "provider": provider,
        "model": _tts_provider_model(provider),
        "voiceName": voice_name,
        "truncated": truncated,
    }
    if provider == "gemini":
        payload["freeTierNote"] = "Uses the Gemini Developer API Standard tier model pricing, which lists free-of-charge input/output for this TTS model."
    return jsonify(payload)


def _build_tts_job(text, voice_name, chat_binding=None, provider="gemini", instruction=None):
    """Validate, chunk, persist, and launch a TTS job. Returns (job_dict, truncated, error_message)."""
    if not text:
        return None, False, "text is required"

    provider = _normalize_tts_provider(provider)
    if not provider:
        return None, False, "unsupported TTS provider"

    truncated = False
    max_chars = _tts_provider_max_chars(provider)
    if len(text) > max_chars:
        text = text[:max_chars].rstrip()
        truncated = True

    chunks = chunk_tts_text(
        text,
        target_chars=_tts_provider_chunk_target(provider),
        max_chars=_tts_provider_chunk_max(provider),
    )
    if not chunks:
        return None, truncated, "text is empty after normalization"

    job_id = uuid.uuid4().hex
    voice_name = voice_name or _tts_provider_default_voice(provider)
    job = {
        "jobId": job_id,
        "status": "queued",
        "provider": provider,
        "model": _tts_provider_model(provider),
        "voiceName": voice_name,
        "instruction": instruction or (QWEN_TTS_DEFAULT_INSTRUCT if provider == QWEN_TTS_PROVIDER else ""),
        "inputChars": len(text),
        "truncated": truncated,
        "chunksTotal": len(chunks),
        "chunksDone": 0,
        "chunksReady": 0,
        "currentChunk": 0,
        "currentChunkChars": 0,
        "chunkTimings": [],
        "message": "Queued",
        "createdAt": time.time(),
        "startedAt": None,
        "finishedAt": None,
        "outputBytes": 0,
        "audioSeconds": 0,
        "error": None,
        "chunks": chunks,
        "chunk_audio_paths": [None] * len(chunks),
        "audio_path": None,
        "cancel_event": threading.Event(),
    }
    if chat_binding:
        job["chatBinding"] = dict(chat_binding)

    with TTS_JOBS_LOCK:
        TTS_JOBS[job_id] = job
    _persist_tts_job(job)

    threading.Thread(target=_run_tts_job, args=(job_id,), daemon=True).start()
    return job, truncated, None


@app.route("/tts-job", methods=["POST"])
def create_tts_job():
    body = request.get_json(force=True)
    text = (body.get("text") or "").strip()
    provider = _normalize_tts_provider(body.get("provider", "gemini"))
    if not provider:
        return jsonify({"error": "unsupported TTS provider"}), 400
    voice_name = body.get("voiceName") or _tts_provider_default_voice(provider)
    instruction = body.get("instruction") or None

    if not text:
        return jsonify({"error": "text is required"}), 400
    provider_error = _validate_tts_provider_request(provider)
    if provider_error:
        return jsonify({"error": provider_error}), 400

    _cleanup_tts_jobs()
    job, _truncated, err = _build_tts_job(text, voice_name, provider=provider, instruction=instruction)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(_public_tts_job(job)), 202


@app.route("/chat-tts", methods=["POST"])
def create_chat_tts():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    session_id = body.get("sessionId")
    message_id = body.get("messageId")
    provider = _normalize_tts_provider(body.get("provider", "gemini"))
    if not provider:
        return jsonify({"error": "unsupported TTS provider"}), 400
    voice_name = body.get("voiceName") or _tts_provider_default_voice(provider)
    instruction = body.get("instruction") or None
    force = bool(body.get("force", False))

    if not video_id or not session_id or not message_id:
        return jsonify({"error": "videoId, sessionId, and messageId are required"}), 400
    provider_error = _validate_tts_provider_request(provider)
    if provider_error:
        return jsonify({"error": provider_error}), 400

    with _session_file_lock(video_id):
        session = _load_session(video_id, session_id)
        if not session:
            return jsonify({"error": "Chat session not found"}), 404
        message = next((m for m in session.get("messages", []) if m.get("id") == message_id), None)
        if not message or message.get("role") != "assistant":
            return jsonify({"error": "Assistant message not found"}), 404

        text = (message.get("text") or "").strip()
        if not text:
            return jsonify({"error": "Message has no text to speak"}), 400

        existing_job_id = (message.get("audio") or {}).get("jobId")
        if not force and existing_job_id:
            with TTS_JOBS_LOCK:
                cached = TTS_JOBS.get(existing_job_id)
            if not cached:
                cached = _load_tts_job(existing_job_id)
            if cached and cached.get("status") != "error" and cached.get("provider", "gemini") == provider:
                cached.setdefault("chatBinding", {
                    "videoId": video_id,
                    "sessionId": session_id,
                    "messageId": message_id,
                })
                return jsonify(_public_tts_job(cached))

        _cleanup_tts_jobs()
        chat_binding = {
            "videoId": video_id,
            "sessionId": session_id,
            "messageId": message_id,
        }
        job, _truncated, err = _build_tts_job(
            text,
            voice_name,
            chat_binding=chat_binding,
            provider=provider,
            instruction=instruction,
        )
        if err:
            return jsonify({"error": err}), 400

        message["audio"] = _public_audio_state(job)
        _save_session(session)
        return jsonify(_public_tts_job(job)), 202


@app.route("/tts-job/<job_id>/events", methods=["GET"])
def tts_job_events(job_id):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
    if not job:
        job = _load_tts_job(job_id)
    if not job:
        return jsonify({"error": "TTS job not found"}), 404

    cond = _job_condition(job_id)

    # Cap how long a single SSE connection holds a Flask worker thread. Long
    # Gemini TTS jobs normally complete well within this window; if the client
    # is still interested past the cap it will reconnect (browsers honor the
    # `retry:` hint), freeing the thread in the meantime.
    MAX_STREAM_LIFETIME_SEC = 300

    def stream():
        last_payload = None
        started = time.time()
        try:
            yield "retry: 2000\n\n"
            while True:
                with TTS_JOBS_LOCK:
                    current = TTS_JOBS.get(job_id)
                if not current:
                    yield "event: closed\ndata: {}\n\n"
                    return
                public = _public_tts_job(current)
                payload = json.dumps(public)
                if payload != last_payload:
                    yield f"data: {payload}\n\n"
                    last_payload = payload
                if public.get("status") in ("done", "error", "cancelled"):
                    return
                if time.time() - started >= MAX_STREAM_LIFETIME_SEC:
                    yield "event: timeout\ndata: {}\n\n"
                    return
                with cond:
                    cond.wait(timeout=2.0)
        except GeneratorExit:
            return

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }
    return Response(stream(), mimetype="text/event-stream", headers=headers)


@app.route("/tts-job/<job_id>", methods=["GET"])
def get_tts_job(job_id):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
    if not job:
        job = _load_tts_job(job_id)
    if not job:
        return jsonify({"error": "TTS job not found"}), 404
    return jsonify(_public_tts_job(job))


@app.route("/tts-job/<job_id>", methods=["DELETE"])
def cancel_tts_job(job_id):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
    if not job:
        job = _load_tts_job(job_id)
    if not job:
        return jsonify({"error": "TTS job not found"}), 404
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
        job["cancel_event"].set()
        process = job.get("qwen_process")
        if job["status"] in ("queued", "running", "rate_limited"):
            job["status"] = "cancelling"
            job["message"] = "Cancelling"
            _persist_tts_job(job)
        if process:
            threading.Thread(target=_terminate_process, args=(process,), daemon=True).start()
        return jsonify(_public_tts_job(job))


@app.route("/tts-job/<job_id>/retry", methods=["POST"])
def retry_tts_job(job_id):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
    if not job:
        job = _load_tts_job(job_id)
    if not job:
        return jsonify({"error": "TTS job not found"}), 404
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
        if job["status"] not in ("error", "cancelled"):
            return jsonify({"error": "Only failed or cancelled TTS jobs can be retried"}), 409
        job["status"] = "queued"
        job["message"] = "Queued for retry"
        job["error"] = None
        job["finishedAt"] = None
        job["cancel_event"] = threading.Event()
        _persist_tts_job(job)
        public = _public_tts_job(job)

    thread = threading.Thread(target=_run_tts_job, args=(job_id,), daemon=True)
    thread.start()
    return jsonify(public), 202


@app.route("/tts-job/<job_id>/chunk/<int:chunk_index>/audio", methods=["GET"])
def get_tts_job_chunk_audio(job_id, chunk_index):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
    if not job:
        job = _load_tts_job(job_id)
    if not job:
        return jsonify({"error": "TTS job not found"}), 404
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
        chunk_paths = job.get("chunk_audio_paths", [])
        if chunk_index < 1 or chunk_index > len(chunk_paths):
            return jsonify({"error": "TTS chunk not found"}), 404
        audio_path = chunk_paths[chunk_index - 1]
        if not audio_path:
            return jsonify({"error": "TTS chunk audio is not ready"}), 409

    if not os.path.exists(audio_path):
        return jsonify({"error": "TTS chunk audio file is missing"}), 404
    return send_file(audio_path, mimetype="audio/wav", as_attachment=False, download_name=f"{job_id}_chunk_{chunk_index}.wav")


@app.route("/tts-job/<job_id>/audio", methods=["GET"])
def get_tts_job_audio(job_id):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
    if not job:
        job = _load_tts_job(job_id)
    if not job:
        return jsonify({"error": "TTS job not found"}), 404
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
        if job.get("status") != "done" or not job.get("audio_path"):
            return jsonify({"error": "TTS audio is not ready"}), 409
        audio_path = job["audio_path"]

    if not os.path.exists(audio_path):
        return jsonify({"error": "TTS audio file is missing"}), 404
    return send_file(audio_path, mimetype="audio/wav", as_attachment=False, download_name=f"{job_id}.wav")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5055, debug=True)
