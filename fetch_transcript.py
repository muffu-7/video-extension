#!/usr/bin/env python3
"""Fetch a YouTube video transcript and output it in timestamped text format.

Usage:
    python3 fetch_transcript.py VIDEO_ID [--lang LANG] [--api-key KEY]

Examples:
    python3 fetch_transcript.py dQw4w9WgXcQ
    python3 fetch_transcript.py dQw4w9WgXcQ --lang German
    python3 fetch_transcript.py dQw4w9WgXcQ --api-key YOUR_KEY

The API key can also be set via the YOUTUBE_TRANSCRIPT_API_KEY env var.
Output is written to a .txt file named after the video title.
"""

import argparse
import json
import math
import os
import re
import sys
import urllib.request
import urllib.error

API_URL = "https://www.youtube-transcript.io/api/transcripts"


def format_time(seconds):
    s = float(seconds)
    m = int(s) // 60
    sec = int(s) % 60
    return f"{m:02d}:{sec:02d}"


def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()


def fetch_transcript(video_id, api_key):
    payload = json.dumps({"ids": [video_id]}).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Basic {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"API error {e.code}: {body}", file=sys.stderr)
        sys.exit(1)


def build_transcript_text(track):
    lines = []
    for entry in track:
        try:
            start = float(entry.get("start", 0))
            dur = float(entry.get("dur", 0))
        except (ValueError, TypeError):
            continue
        if math.isnan(start) or math.isnan(dur):
            continue

        end = start + dur
        text = entry.get("text", "").replace("\n", " ")

        lines.append(f"{format_time(start)} {text}")
        lines.append(f"{format_time(end)} ")
        lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Fetch YouTube transcript")
    parser.add_argument("video_id", help="YouTube video ID")
    parser.add_argument("--lang", default="English", help="Transcript language (default: English)")
    parser.add_argument("--api-key", default=None, help="API key (or set YOUTUBE_TRANSCRIPT_API_KEY env var)")

    # Insert "--" before the first non-flag argument so IDs starting with "-" aren't treated as flags
    fixed_args = sys.argv[1:]
    for i, arg in enumerate(fixed_args):
        if not arg.startswith("--"):
            fixed_args.insert(i, "--")
            break

    args = parser.parse_args(fixed_args)

    api_key = args.api_key or os.environ.get("YOUTUBE_TRANSCRIPT_API_KEY") or "68280dd15832dd71e667d308"

    data = fetch_transcript(args.video_id, api_key)
    if not data or not isinstance(data, list) or len(data) == 0:
        print("Error: no data returned from API", file=sys.stderr)
        sys.exit(1)

    video = data[0]
    title = video.get("title", args.video_id)
    tracks = video.get("tracks", [])

    LANG_ALIASES = {
        "english": "en", "german": "de", "french": "fr", "spanish": "es",
        "portuguese": "pt", "italian": "it", "japanese": "ja", "korean": "ko",
        "chinese": "zh", "russian": "ru", "arabic": "ar", "hindi": "hi",
    }

    lang_query = args.lang.lower()
    track = None
    for t in tracks:
        lang = t.get("language", "").lower()
        if lang == lang_query or lang == LANG_ALIASES.get(lang_query, ""):
            track = t["transcript"]
            break

    if not track and tracks:
        track = tracks[0]["transcript"]
        print(f"Note: '{args.lang}' not found, using '{tracks[0].get('language')}'", file=sys.stderr)

    if not track:
        print("Error: no transcript tracks available", file=sys.stderr)
        sys.exit(1)

    transcript_text = build_transcript_text(track)
    filename = sanitize_filename(title) + ".txt"
    filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(transcript_text)

    print(f"Saved: {filepath}")
    print(f"Title: {title}")
    print(f"Language: {args.lang}")
    print(f"Entries: {len(track)}")


if __name__ == "__main__":
    main()
