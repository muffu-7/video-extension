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
import shutil
import subprocess
import tempfile
import time
import urllib.request
import urllib.error

from flask import Flask, request, jsonify
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

os.makedirs(CACHE_DIR, exist_ok=True)

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
For each pointer, provide:
- The time window (MM:SS-MM:SS) where it is discussed
- A detailed description of the point

Format as a numbered list. Be comprehensive — capture every distinct important point,
argument, or piece of news discussed in the video. Include enough detail that someone
could understand each point without watching the video.
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

    return jsonify({
        "extensionInput": clean_segments_line(codex_output),
        "details": codex_output,
        "title": title,
        "usage": usage,
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


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5055, debug=True)
