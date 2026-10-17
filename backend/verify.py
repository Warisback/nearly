"""Step 2: ask Cosmos3-Reason what one hand did in one short shelf clip.

    python -m backend.verify clips/labelled/clip_01.mp4      (from nearly/)

Request shape and quirks are in NOTES.md section 1: OpenAI-style chat completions with the clip as a
base64 data URI, the model id read from /v1/models, a Bearer token when GPU_BEARER_TOKEN is set.
Replies that don't parse, or come back below 0.6 confidence, become cant_tell. "none" means no event.
Standard library only, so it runs on the laptop, the VM and the pod alike.
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

NEARLY = Path(__file__).resolve().parent.parent

# The exact prompt from CLAUDE.md ("The Cosmos prompt").
PROMPT = """You are checking one short clip from a camera above a shop shelf. Reply with JSON only:
{"action": "take" | "put" | "touch" | "none" | "cant_tell", "zone": "1"-"6" or null, "confidence": 0 to 1, "why": "under 12 words"}
take = an item leaves the shelf in the person's hand and stays out.
put = an item that was in the person's hand goes back onto the shelf.
touch = the hand touches the shelf but nothing leaves or returns.
none = nobody reaches into the shelf.
zone = the number on the sticker under where the hand went.
If the hand is hidden or you are unsure, answer cant_tell. Do not guess."""

ACTIONS = {"take", "put", "touch", "none", "cant_tell"}
MIN_CONFIDENCE = 0.6
TIMEOUT_S = 60
_model_id: str | None = None


def load_env(path: Path = NEARLY / ".env") -> None:
    """KEY=value lines from nearly/.env (gitignored) fill in anything the environment lacks."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def base_url() -> str:
    url = os.environ.get("COSMOS3_REASON_URL", "").strip().rstrip("/")
    if not url:
        raise SystemExit("COSMOS3_REASON_URL isn't set: copy it from /config/<team>.config into nearly/.env")
    return url[:-3] if url.endswith("/v1") else url


def _request(method: str, path: str, body: dict | None = None) -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    token = os.environ.get("GPU_BEARER_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base_url() + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def model_id(refresh: bool = False) -> str:
    """At SF and NYC the endpoint served nvidia/cosmos3-nano-reasoner; the documented id 404'd."""
    global _model_id
    if refresh or not _model_id:
        _model_id = _request("GET", "/v1/models")["data"][0]["id"]
    return _model_id


def prepare(clip: Path) -> Path:
    """Short, small H.264 without audio: about 5x fewer tokens and faster replies (NOTES section 1)."""
    if not shutil.which("ffmpeg"):
        return clip
    out = Path(tempfile.mkdtemp(prefix="nearly-clip-")) / "clip.mp4"
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(clip), "-t", "6", "-vf", "scale=960:-2",
           "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", str(out)]
    return out if subprocess.run(cmd).returncode == 0 and out.is_file() else clip


def parse(content: str) -> dict | None:
    """Strip <think>, prefer <answer>, drop ``` fences, take the first {...}. None if unusable."""
    text = re.sub(r"<think>.*?</think>", "", content or "", flags=re.S)
    answer = re.search(r"<answer>(.*?)</answer>", text, flags=re.S)
    text = (answer.group(1) if answer else text).replace("```json", "").replace("```", "")
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i, ch in enumerate(text[start:], start):
        depth += ch == "{"
        depth -= ch == "}"
        if depth == 0:
            try:
                reply = json.loads(text[start:i + 1])
            except json.JSONDecodeError:
                return None
            return reply if isinstance(reply, dict) and reply.get("action") in ACTIONS else None
    return None


def classify(reply: dict | None) -> dict:
    """Map a parsed reply onto what we save: cant_tell below 0.6 or when unusable."""
    if reply is None:
        return {"action": "cant_tell", "zone": None, "confidence": 0.0, "why": "Reply didn't parse."}
    try:
        confidence = max(0.0, min(1.0, float(reply.get("confidence", 0))))
    except (TypeError, ValueError):
        confidence = 0.0
    zone = str(reply["zone"]) if reply.get("zone") not in (None, "", "null") else None
    action = reply["action"]
    if action != "none" and confidence < MIN_CONFIDENCE:
        action = "cant_tell"
    return {"action": action, "zone": zone if zone in {"1", "2", "3", "4", "5", "6"} else None,
            "confidence": round(confidence, 2), "why": str(reply.get("why", ""))[:120]}


def verify(clip: str | Path, prepared: bool = False) -> dict:
    """Check one clip. Returns the verdict plus seconds, model and the raw reply for the eval.
    prepared=True sends the file as is (the live path has already re-encoded it)."""
    load_env()
    clip = Path(clip)
    sent = clip if prepared else prepare(clip)
    payload = base64.b64encode(sent.read_bytes()).decode()
    if sent != clip:
        shutil.rmtree(sent.parent, ignore_errors=True)
    started = time.perf_counter()
    raw, error = "", None
    for attempt in range(2):
        try:
            body = {
                "model": model_id(refresh=attempt > 0),
                "temperature": 0,
                "max_tokens": 256,
                "messages": [{"role": "user", "content": [
                    {"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{payload}"}},
                    {"type": "text", "text": PROMPT},
                ]}],
            }
            raw = _request("POST", "/v1/chat/completions", body)["choices"][0]["message"].get("content") or ""
            error = None
            break
        except urllib.error.HTTPError as err:
            error = f"HTTP {err.code}"
            if err.code in (401, 403):
                error += ": set GPU_BEARER_TOKEN in nearly/.env"
                break
            if err.code not in (404, 429, 502, 503):
                break
        except (urllib.error.URLError, TimeoutError) as err:
            error = f"no answer: {getattr(err, 'reason', err)}"
        time.sleep(2)
    seconds = round(time.perf_counter() - started, 2)
    verdict = classify(parse(raw)) if error is None else {
        "action": "cant_tell", "zone": None, "confidence": 0.0, "why": "Cosmos didn't answer."}
    return {**verdict, "event": verdict["action"] != "none", "seconds": seconds,
            "model": _model_id, "clip": clip.name, "raw": raw[:500], "error": error}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m backend.verify <clip.mp4>")
    print(json.dumps(verify(sys.argv[1]), indent=2))
