#!/usr/bin/env python3
"""Local service that fetches a YouTube transcript and uses the Codex CLI to
extract segments, generate summaries, and answer questions about videos."""

import glob
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

load_dotenv()

app = Flask(__name__)
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


def get_transcript_text(video_id):
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

    transcript_text = build_transcript_text(track)
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


def build_transcript_text(track):
    lines = []
    for entry in track:
        try:
            start = float(entry.get("start", 0))
        except (ValueError, TypeError):
            continue
        if math.isnan(start):
            continue
        text = entry.get("text", "").replace("\n", " ")
        lines.append(f"{format_time(start)} {text}")
    return "\n".join(lines)


def run_codex(prompt, stdin_text):
    """Run codex exec with a prompt and stdin, return the output."""
    codex_path = shutil.which("codex")
    if not codex_path:
        raise RuntimeError("codex CLI not found on PATH")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as out_file:
        out_path = out_file.name

    try:
        result = subprocess.run(
            [
                codex_path, "exec",
                "--skip-git-repo-check",
                "-s", "read-only",
                "-o", out_path,
                prompt,
            ],
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            raise RuntimeError(f"codex exec failed (exit {result.returncode}): {stderr}")

        with open(out_path, "r") as f:
            return f.read().strip()
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


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
        codex_output = run_codex(prompt, transcript_text)
    except Exception as e:
        return jsonify({"error": f"Codex CLI failed: {e}"}), 502

    return jsonify({
        "extensionInput": clean_segments_line(codex_output),
        "details": codex_output,
        "title": title,
    })


@app.route("/ask", methods=["POST"])
def ask_about_video():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    question = body.get("question", "").strip()

    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    if not question:
        return jsonify({"error": "question is required"}), 400

    try:
        transcript_text, title = get_transcript_text(video_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to fetch transcript: {e}"}), 502

    prompt = ASK_PROMPT.format(question=question)
    try:
        answer = run_codex(prompt, transcript_text)
    except Exception as e:
        return jsonify({"error": f"Codex CLI failed: {e}"}), 502

    return jsonify({"answer": answer, "title": title})


@app.route("/summary", methods=["POST"])
def summarize_video():
    body = request.get_json(force=True)
    video_id = body.get("videoId")
    summary_type = body.get("type", "detailed")

    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    if summary_type not in SUMMARY_PROMPTS:
        return jsonify({"error": f"Invalid type. Use: {', '.join(SUMMARY_PROMPTS.keys())}"}), 400

    try:
        transcript_text, title = get_transcript_text(video_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to fetch transcript: {e}"}), 502

    prompt = SUMMARY_PROMPTS[summary_type]
    try:
        result = run_codex(prompt, transcript_text)
    except Exception as e:
        return jsonify({"error": f"Codex CLI failed: {e}"}), 502

    return jsonify({"summary": result, "title": title})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5055, debug=True)
