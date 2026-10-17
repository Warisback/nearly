"""Step 3, the direct path: a clip lands in clips/incoming/, Cosmos checks it, the event is saved.

A background thread inside the backend (app.py starts it when COSMOS3_REASON_URL is set). Drop phone
clips into clips/incoming/ by hand, by AirDrop, or by letting the OneDrive app sync into that folder.
Each clip is claimed by moving it to clips/incoming/done/ (a file still being written or held open
stays put and is retried), re-encoded for the browser as clips/ev_XXXX.mp4, shown as "checking" on
the Monitor while Cosmos looks at it, then saved as a ShelfEvent carrying the seconds from the file
first appearing to the event being saved. "none" saves nothing, and neither does a failed call.
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
DONE = INCOMING / "done"
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
POLL_S = 0.5


def encode_for_web(src: Path, dest: Path) -> None:
    """H.264, faststart, no audio, 960 px, the last 8 s (a put-back ends the clip): plays in every
    browser and is exactly what Cosmos is sent. Without ffmpeg (the pod) the clip goes as it came."""
    if not shutil.which("ffmpeg"):
        shutil.copyfile(src, dest)
        return
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-sseof", "-8", "-i", str(src), "-vf", "scale=960:-2", "-an",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-movflags", "+faststart", str(dest)]
    if subprocess.run(cmd).returncode != 0 or not dest.is_file():
        raise OSError(f"ffmpeg couldn't read {src.name}")


def handle(state: State, clip: Path, arrived_at: float) -> None:
    """Check one claimed clip (already moved into done/)."""
    event_id = state.next_event_id()
    dest = ROOT / "clips" / f"{event_id}.mp4"
    try:
        encode_for_web(clip, dest)
    except OSError as err:
        print(f"live: couldn't read {clip.name}: {err}", flush=True)
        return
    clip_url = f"clips/{dest.name}"
    run = state.begin_check(clip_url)
    print(f"live: {clip.name} -> {clip_url}, checking with Cosmos", flush=True)
    try:
        result = verify(dest, prepared=True)
    except Exception:
        state.end_check(run)
        raise
    if result["error"]:
        # Cosmos was never asked or never answered: say so in the log, don't invent a "can't tell".
        state.end_check(run)
        print(f"live: {clip.name} not checked: {result['error']}", flush=True)
    elif result["action"] == "none":
        state.end_check(run)
        print(f"live: {clip.name}: nobody reached in ({result['seconds']} s with Cosmos), nothing saved", flush=True)
    else:
        event = state.save_event(event_id, result, clip_url, arrived_at, run)
        if event is None:
            print(f"live: {clip.name}: dropped, the demo was reset while Cosmos was checking", flush=True)
        else:
            print(f"live: saved {event['event_id']} {event['action']} {event['product_id']} at {event['zone_id']} "
                  f"({event['confidence']:.2f}), {event['latency_s']} s from arrival, Cosmos {result['seconds']} s", flush=True)


def watch(state: State, stop: threading.Event) -> None:
    """Poll clips/incoming/. A file counts once its size holds still for one poll and it can be moved."""
    pending: dict[Path, tuple[float, int]] = {}
    while not stop.is_set():
        try:
            DONE.mkdir(parents=True, exist_ok=True)
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
                # Claim it before anything else, so a failure later can never re-run the same clip.
                claimed = DONE / f"{time.time_ns() // 1_000_000}_{path.name}"
                try:
                    path.rename(claimed)
                except OSError:
                    continue  # still open somewhere: retried next poll, arrival time kept
                pending.pop(path, None)
                try:
                    handle(state, claimed, first_seen)
                except Exception as err:  # one bad clip must never stop the watcher
                    print(f"live: {path.name} failed: {err!a}", flush=True)
        except Exception as err:
            print(f"live: watcher error {err!a}", flush=True)
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
