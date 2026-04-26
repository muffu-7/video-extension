#!/usr/bin/env python3
"""Local service that fetches a YouTube transcript and uses the Codex CLI to
extract segments, generate summaries, and answer questions about videos."""

import sys
sys.dont_write_bytecode = True

import base64
import glob
import io
import json
import math
import os
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

from flask import Flask, request, jsonify, send_file
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
TTS_JOB_DIR = os.path.expanduser("~/.cache/video-extension/tts")

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(TTS_JOB_DIR, exist_ok=True)

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
TTS_SEMAPHORE = threading.Semaphore(GEMINI_TTS_CONCURRENCY)


def _tts_chunk_audio_path(job_id, chunk_index):
    return os.path.join(TTS_JOB_DIR, f"{job_id}_chunk_{chunk_index}.wav")


def _tts_job_meta_path(job_id):
    return os.path.join(TTS_JOB_DIR, f"{job_id}.json")


def _serializable_tts_job(job):
    data = {k: v for k, v in job.items() if k != "cancel_event"}
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
    public = {k: v for k, v in job.items() if k not in ("cancel_event", "audio_path", "chunks", "chunk_audio_paths")}
    public["audioReady"] = bool(job.get("audio_path") and os.path.exists(job["audio_path"]))
    public["chunkAudioReady"] = [
        i + 1
        for i, path in enumerate(job.get("chunk_audio_paths", []))
        if path and os.path.exists(path)
    ]
    public["concurrency"] = GEMINI_TTS_CONCURRENCY
    return public


def _set_tts_job(job_id, **updates):
    with TTS_JOBS_LOCK:
        job = TTS_JOBS.get(job_id)
        if not job:
            return None
        job.update(updates)
        _persist_tts_job(job)
        return job


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
            for path in paths:
                if not path:
                    continue
                try:
                    os.unlink(path)
                except OSError:
                    pass
            TTS_JOBS.pop(job_id, None)


def _tts_error_payload(e, chunk_index=None):
    status_code = _error_status_code(e)
    error_type = "gemini_error"
    retryable = False
    retry_after = None

    if status_code == 429:
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
    acquired = False

    try:
        if job["cancel_event"].is_set():
            _set_tts_job(job_id, status="cancelled", finishedAt=time.time(), message="Cancelled")
            return

        _set_tts_job(job_id, status="queued", message="Queued")
        TTS_SEMAPHORE.acquire()
        acquired = True

        if job["cancel_event"].is_set():
            _set_tts_job(job_id, status="cancelled", finishedAt=time.time(), message="Cancelled")
            return

        if not job.get("startedAt"):
            _set_tts_job(job_id, startedAt=time.time())
        _set_tts_job(job_id, status="running")

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
            wav_bytes = generate_gemini_tts_audio(chunk, voice_name=job["voiceName"])
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
            error=_tts_error_payload(e, chunk_index=chunk_index),
            finishedAt=time.time(),
            message="Speech generation failed",
        )
    finally:
        if acquired:
            TTS_SEMAPHORE.release()


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
    voice_name = body.get("voiceName", GEMINI_TTS_DEFAULT_VOICE)

    if not text:
        return jsonify({"error": "text is required"}), 400
    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        return jsonify({
            "error": "GEMINI_API_KEY is not set. Paste your Google AI Studio key into .env.",
        }), 400

    truncated = False
    if len(text) > GEMINI_TTS_MAX_CHARS:
        text = text[:GEMINI_TTS_MAX_CHARS].rstrip()
        truncated = True

    try:
        wav_bytes = generate_gemini_tts_audio(text, voice_name=voice_name)
    except Exception as e:
        app.logger.exception("tts failed")
        return jsonify({"error": f"Gemini TTS failed: {e}"}), 502

    return jsonify({
        "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
        "mimeType": "audio/wav",
        "model": GEMINI_TTS_MODEL,
        "voiceName": voice_name,
        "truncated": truncated,
        "freeTierNote": "Uses the Gemini Developer API Standard tier model pricing, which lists free-of-charge input/output for this TTS model.",
    })


@app.route("/tts-job", methods=["POST"])
def create_tts_job():
    body = request.get_json(force=True)
    text = body.get("text", "").strip()
    voice_name = body.get("voiceName", GEMINI_TTS_DEFAULT_VOICE)

    if not text:
        return jsonify({"error": "text is required"}), 400
    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        return jsonify({
            "error": "GEMINI_API_KEY is not set. Paste your Google AI Studio key into .env.",
        }), 400

    _cleanup_tts_jobs()
    truncated = False
    if len(text) > GEMINI_TTS_MAX_CHARS:
        text = text[:GEMINI_TTS_MAX_CHARS].rstrip()
        truncated = True

    chunks = chunk_tts_text(text)
    if not chunks:
        return jsonify({"error": "text is empty after normalization"}), 400

    job_id = uuid.uuid4().hex
    job = {
        "jobId": job_id,
        "status": "queued",
        "model": GEMINI_TTS_MODEL,
        "voiceName": voice_name,
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

    with TTS_JOBS_LOCK:
        TTS_JOBS[job_id] = job
    _persist_tts_job(job)

    thread = threading.Thread(target=_run_tts_job, args=(job_id,), daemon=True)
    thread.start()
    return jsonify(_public_tts_job(job)), 202


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
        if job["status"] in ("queued", "running", "rate_limited"):
            job["status"] = "cancelling"
            job["message"] = "Cancelling"
            _persist_tts_job(job)
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
