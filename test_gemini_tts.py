#!/usr/bin/env python3
"""Smoke test for the local Gemini TTS integration."""

import argparse
import os
import sys
import time
import traceback
import json
import urllib.error
import urllib.request
from pathlib import Path

from server import GEMINI_TTS_MODEL, chunk_tts_text, generate_gemini_tts_audio


def main():
    parser = argparse.ArgumentParser(description="Generate a Gemini TTS WAV sample.")
    parser.add_argument(
        "--text",
        default="Gemini text to speech is configured correctly.",
        help="Short text to synthesize.",
    )
    parser.add_argument(
        "--file",
        help="Read the text to synthesize from a UTF-8 text file.",
    )
    parser.add_argument(
        "--chunk-only",
        action="store_true",
        help="Only print how the input would be chunked; do not call Gemini.",
    )
    parser.add_argument(
        "--via-job",
        action="store_true",
        help="Use the local /tts-job API instead of calling Gemini directly.",
    )
    parser.add_argument(
        "--server",
        default="http://127.0.0.1:5055",
        help="Local server URL for --via-job.",
    )
    parser.add_argument(
        "--voice",
        default=os.environ.get("GEMINI_TTS_VOICE", "Kore"),
        help="Gemini prebuilt voice name.",
    )
    parser.add_argument(
        "--out",
        default="/tmp/gemini_tts_test.wav",
        help="Output WAV path.",
    )
    args = parser.parse_args()

    text = Path(args.file).read_text(encoding="utf-8") if args.file else args.text

    print(f"model={GEMINI_TTS_MODEL}", flush=True)
    print(f"voice={args.voice}", flush=True)
    print(f"input_chars={len(text)}", flush=True)
    print(f"input_lines={text.count(chr(10)) + 1 if text else 0}", flush=True)

    chunks = chunk_tts_text(text)
    print(f"chunks={len(chunks)}", flush=True)
    for i, chunk in enumerate(chunks, start=1):
        print(f"chunk_{i}_chars={len(chunk)}", flush=True)

    if args.chunk_only:
        return 0

    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        print("GEMINI_API_KEY is not set. Add it to .env, then run this test again.", file=sys.stderr)
        return 2

    if args.via_job:
        return run_via_job(args.server, text, args.voice, args.out)

    print("request_started=true", flush=True)

    start = time.perf_counter()
    try:
        wav_bytes = generate_gemini_tts_audio(text, voice_name=args.voice)
    except Exception as e:
        elapsed = time.perf_counter() - start
        print(f"request_failed=true", file=sys.stderr, flush=True)
        print(f"elapsed_seconds={elapsed:.2f}", file=sys.stderr, flush=True)
        print(f"error_type={type(e).__module__}.{type(e).__name__}", file=sys.stderr, flush=True)
        print(f"error={e}", file=sys.stderr, flush=True)
        traceback.print_exc()
        return 1

    elapsed = time.perf_counter() - start
    with open(args.out, "wb") as f:
        f.write(wav_bytes)

    print(f"Generated {args.out} with {GEMINI_TTS_MODEL} voice={args.voice}")
    print(f"elapsed_seconds={elapsed:.2f}")
    print(f"output_bytes={len(wav_bytes)}")
    return 0


def request_json(method, url, payload=None, timeout=30):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
        except Exception:
            body = {"error": str(e)}
        return e.code, body


def run_via_job(server, text, voice, out_path):
    print("job_request_started=true", flush=True)
    start = time.perf_counter()
    status, data = request_json("POST", f"{server}/tts-job", {"text": text, "voiceName": voice})
    if status >= 400:
        print(f"job_create_failed={data}", file=sys.stderr)
        return 1

    job_id = data["jobId"]
    print(f"job_id={job_id}", flush=True)
    last_done = -1
    while True:
        status, job = request_json("GET", f"{server}/tts-job/{job_id}", timeout=30)
        if status >= 400:
            print(f"job_status_failed={job}", file=sys.stderr)
            return 1

        done = job.get("chunksDone", 0)
        if done != last_done or job.get("status") in ("done", "error", "cancelled"):
            print(
                f"job_status={job.get('status')} chunks={done}/{job.get('chunksTotal')} "
                f"message={job.get('message')}",
                flush=True,
            )
            last_done = done

        if job.get("status") == "done":
            break
        if job.get("status") in ("error", "cancelled"):
            print(f"job_error={job.get('error')}", file=sys.stderr)
            return 1
        time.sleep(1)

    req = urllib.request.Request(f"{server}/tts-job/{job_id}/audio", method="GET")
    with urllib.request.urlopen(req, timeout=60) as resp:
        wav_bytes = resp.read()
    Path(out_path).write_bytes(wav_bytes)

    elapsed = time.perf_counter() - start
    print(f"Generated {out_path} through /tts-job")
    print(f"elapsed_seconds={elapsed:.2f}")
    print(f"output_bytes={len(wav_bytes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
