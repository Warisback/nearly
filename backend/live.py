"""Step 3, the direct path: a clip lands in clips/incoming/, Cosmos checks it, the event is saved.

A background thread inside the backend (app.py starts it when COSMOS3_REASON_URL is set). Drop phone
clips into clips/incoming/ by hand, by AirDrop, or by letting the OneDrive app sync into that folder.
Each clip is re-encoded for the browser as clips/ev_XXXX.mp4 and shown as "checking" on the Monitor
while Cosmos looks at it. Then it's saved as a ShelfEvent carrying the seconds from the file arriving
to the event being saved. "none" saves nothing. The original moves to clips/incoming/done/.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from backend.state import ROOT, State
from backend.verify import load_env, verify

INCOMING = ROOT / "clips" / "incoming"
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
POLL_S = 0.5
# Cosmos can't be asked at all: say so in the log, but don't invent a "can't tell" event.
NO_ASK = ("HTTP 401", "HTTP 403", "COSMOS3_REASON_URL")


def encode_for_web(src: Path, dest: Path) -> None:
    """H.264, faststart, no audio, 960 px: plays in every browser and is what Cosmos is sent."""
    if shutil.which("ffmpeg"):
        cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-t", "8", "-vf", "scale=960:-2", "-an",
               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-movflags", "+faststart", str(dest)]
        if subprocess.run(cmd).returncode == 0 and dest.is_file():
            return
    shutil.copyfile(src, dest)


def handle(state: State, path: Path, arrived_at: float) -> None:
    event_id = state.next_event_id()
    dest = ROOT / "clips" / f"{event_id}.mp4"
    try:
        encode_for_web(path, dest)
    except OSError as err:
        print(f"live: couldn't read {path.name}: {err}", flush=True)
        return
    clip_url = f"clips/{dest.name}"
    state.begin_check(clip_url)
    print(f"live: {path.name} -> {clip_url}, checking with Cosmos", flush=True)
    result = verify(dest, prepared=True)
    if result["error"] and result["error"].startswith(NO_ASK):
        state.end_check()
        print(f"live: {path.name} not checked: {result['error']}", flush=True)
    elif result["action"] == "none":
        state.end_check()
        print(f"live: {path.name}: nobody reached in ({result['seconds']} s with Cosmos), nothing saved", flush=True)
    else:
        event = state.save_event(event_id, result, clip_url, arrived_at)
        print(f"live: saved {event['event_id']} {event['action']} {event['product_id']} at {event['zone_id']} "
              f"({event['confidence']:.2f}), {event['latency_s']} s from arrival, Cosmos {result['seconds']} s", flush=True)
    done = INCOMING / "done"
    done.mkdir(exist_ok=True)
    path.replace(done / path.name)


def watch(state: State, stop: threading.Event) -> None:
    """Poll clips/incoming/. A file counts once its size holds still for one poll (copies finish)."""
    INCOMING.mkdir(parents=True, exist_ok=True)
    pending: dict[Path, tuple[float, int]] = {}
    while not stop.is_set():
        for path in sorted(INCOMING.iterdir()):
            if not path.is_file() or path.suffix.lower() not in VIDEO_SUFFIXES or path.name.startswith(("~", ".")):
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            first_seen, last_size = pending.get(path, (time.time(), -1))
            if size == 0 or size != last_size:
                pending[path] = (first_seen, size)
                continue
            pending.pop(path, None)
            try:
                handle(state, path, first_seen)
            except Exception as err:  # one bad clip must never stop the watcher
                print(f"live: {path.name} failed: {err!r}", flush=True)
        stop.wait(POLL_S)


def start(state: State) -> threading.Event | None:
    """Start the watcher unless NEARLY_LIVE=0 or Cosmos isn't configured. Returns its stop flag."""
    load_env()
    if os.environ.get("NEARLY_LIVE") == "0":
        return None
    if not os.environ.get("COSMOS3_REASON_URL"):
        print("live: off (no COSMOS3_REASON_URL; put it in nearly/.env to watch clips/incoming/)", flush=True)
        return None
    stop = threading.Event()
    threading.Thread(target=watch, args=(state, stop), name="live-watcher", daemon=True).start()
    print(f"live: watching {INCOMING}", flush=True)
    return stop
