"""In-memory state for Nearly: the seed, the demo frame pointer, opt-ins and live events.

Every GET route reads from here and nothing in this module calls a model. The scripted demo comes
straight from mock/seed.json, with the same rules as the UI's mock mode (web/src/api.js). Live events
from the shelf camera (backend/live.py) sit on top of the current frame until the demo is reset.
"""

from __future__ import annotations

import copy
import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(os.environ.get("NEARLY_ROOT") or Path(__file__).resolve().parent.parent)
SEED_PATH = ROOT / "mock" / "seed.json"

DEMO_SHOPPER = "demo_07"
DEMO_BRAND = "walkers"
PRIVACY_FLOOR = 5
DEFAULT_ENDCAPS = 40
WEEKS_PER_YEAR = 52
MAX_LIVE_EVENTS = 20
CAMERA_ID = "cam_shelf"
# Sticker number under the products -> zone (the table in ASTRA_ASSETS.md and SOURCE.md).
STICKER_ZONES = {"1": "B2-A", "2": "B2-B", "3": "B2-C", "4": "B1-A", "5": "B1-B", "6": "B1-C"}
UNKNOWN = "unknown"  # zone, product and brand when Cosmos can't say where the hand went

# Copy rules: "put back", never "put"; "Can't tell from this clip", never "uncertain".
ACTION_WORDS = {
    "put": "Put back",
    "take": "Picked up",
    "look": "Looked at",
    "touch": "Touched",
    "cant_tell": "Can't tell from this clip",
}
METRIC_WORDS = {"views": "views", "takes": "pick-ups", "puts": "put-backs"}
METRIC_ACTIONS = {"takes": {"take"}, "puts": {"put"}}
NO_TOTAL_CLIPS = "Source clips are not included for this total yet."
NO_EVENT_CLIP = "No source clip is available for this event yet."


def _public(event: dict) -> dict:
    """Outside api/shopper, shopper_id is always null."""
    return {**event, "shopper_id": None}


def _whole(number: float) -> int | float:
    return int(number) if float(number).is_integer() else number


def _short(name: str) -> str:
    return re.sub(r"\s\d+(g|ml)$", "", name)


class State:
    def __init__(self, seed_path: Path = SEED_PATH):
        self._lock = threading.Lock()
        # utf-8-sig: a seed re-saved by a Windows editor may start with a BOM.
        self.seed = json.loads(Path(seed_path).read_text(encoding="utf-8-sig"))
        self.frames: list[dict] = self.seed["frames"]
        self.static: dict = self.seed.get("static", {})
        self.hero_frame = min(int(self.seed.get("hero_frame", 0)), len(self.frames) - 1)
        self.frame = 0
        self.optins: dict[str, int] = {}
        self.products_by_id = {p["product_id"]: p for p in self.static["api/products"]["products"]}
        self.price_entries = {
            entry["zone_id"]: entry
            for key, entry in self.static.items()
            if urlsplit(key).path == "api/price"
        }
        # Live path: events newest first (shopper_id kept here, nulled on the way out), the pipeline
        # status, and who the next interactions belong to (the latest opt-in claims them).
        self.live_events: list[dict] = []
        self.live_status: dict | None = None
        self.live_pings: dict[str, list[dict]] = {}
        self.active_shopper: str | None = None
        self.frame_changed_at = 0.0
        self._event_seq = max((int(ev["event_id"].split("_")[1]) for frame in self.frames
                               for ev in frame["api/live"]["events"]), default=0)
        self._check_seed()

    def _check_seed(self) -> None:
        """Render every frame once at boot, so a broken seed fails the deploy, not the demo."""
        if not 0 <= int(self.seed.get("hero_frame", 0)) < len(self.frames):
            raise ValueError(f"hero_frame {self.seed.get('hero_frame')} is outside the {len(self.frames)} frames")
        for index in range(len(self.frames)):
            self.frame = index
            self.live(), self.shopper(DEMO_SHOPPER), self.brand(DEMO_BRAND), self.store()
            for ref in self.seed.get("evidence", {}):
                self.evidence(ref)
        self.frame = 0
        self._next_track()

    # ---- demo controls (POST api/demo/*) ----

    def position(self) -> dict:
        return {"frame": self.frame, "label": self.frames[self.frame].get("label", "")}

    def step(self) -> dict:
        with self._lock:
            self.frame = min(self.frame + 1, len(self.frames) - 1)
            self.frame_changed_at = time.time()
            return self.position()

    def hero(self) -> dict:
        with self._lock:
            self.frame = self.hero_frame
            self.frame_changed_at = time.time()
            return self.position()

    def reset(self) -> dict:
        with self._lock:
            self.frame = 0
            self.optins.clear()
            self.live_events.clear()
            self.live_pings.clear()
            self.live_status = None
            self.active_shopper = None
            self.frame_changed_at = time.time()
            return self.position()

    def optin(self, shopper_id: str) -> dict:
        with self._lock:
            track_id = self.optins.get(shopper_id)
            if track_id is None:
                track_id = self._seed_track(shopper_id)
            if track_id is None:
                track_id = self._next_track()
            self.optins[shopper_id] = track_id
            self.active_shopper = shopper_id
            return {"shopper_id": shopper_id, "track_id": track_id}

    def _seed_track(self, shopper_id: str) -> int | None:
        key = f"api/shopper?shopper_id={shopper_id}"
        for frame in self.frames:
            record = frame.get(key)
            if record and record.get("track_id") is not None:
                return record["track_id"]
        return None

    def _next_track(self) -> int:
        seen = [ev["track_id"] for frame in self.frames for ev in frame["api/live"]["events"]]
        seen += list(self.optins.values()) + [ev["track_id"] for ev in self.live_events]
        return max(seen, default=0) + 1

    # ---- live path (called from backend/live.py, never from a GET) ----

    def next_event_id(self) -> str:
        with self._lock:
            self._event_seq += 1
            return f"ev_{self._event_seq:04d}"

    def begin_check(self, clip_url: str) -> None:
        with self._lock:
            last = self.live_status["last_latency_s"] if self.live_status else self.frames[self.frame]["api/live"]["last_latency_s"]
            self.live_status = {"stage": "checking", "clip_url": clip_url, "last_latency_s": last, "at": time.time()}

    def end_check(self) -> None:
        """Nothing to save (nobody reached in, or Cosmos couldn't be asked): back to waiting."""
        with self._lock:
            last = self.live_status["last_latency_s"] if self.live_status else None
            self.live_status = {"stage": "waiting", "clip_url": None, "last_latency_s": last, "at": time.time()}

    def save_event(self, event_id: str, verdict: dict, clip_url: str, arrived_at: float) -> dict:
        """Turn a Cosmos verdict into a ShelfEvent, with the seconds from file arrival to saved."""
        with self._lock:
            zone_id = STICKER_ZONES.get(verdict.get("zone") or "", UNKNOWN)
            product = next((p for p in self.products_by_id.values() if p["zone_id"] == zone_id), None)
            shopper = self.active_shopper
            track_id = self.optins[shopper] if shopper in self.optins else self._next_track()
            latency = round(time.time() - arrived_at, 1)
            event = {
                "event_id": event_id,
                "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "camera_id": CAMERA_ID,
                "track_id": track_id,
                "shopper_id": shopper,
                "zone_id": zone_id,
                "product_id": product["product_id"] if product else UNKNOWN,
                "brand_id": product["brand_id"] if product else UNKNOWN,
                "action": verdict["action"],
                "confidence": verdict["confidence"],
                "clip_url": clip_url,
                "latency_s": latency,
            }
            self.live_events.insert(0, event)
            self.live_status = {"stage": "saved", "clip_url": clip_url, "last_latency_s": latency, "at": time.time()}
            # The brief's deterministic ping (step 5's agent replaces this with its own sentence).
            if shopper and event["action"] == "put" and product and product.get("clubcard_price_gbp") is not None:
                text = f"{_short(product['name'])} is £{product['clubcard_price_gbp']:.2f} with Clubcard today."
                self.live_pings.setdefault(shopper, []).insert(0, {"ts": event["ts"], "product_id": product["product_id"], "text": text})
            return copy.deepcopy(event)

    def _live_snapshot(self) -> tuple[list[dict], dict | None]:
        with self._lock:
            status = self.live_status if self.live_status and self.live_status["at"] >= self.frame_changed_at else None
            return copy.deepcopy(self.live_events), copy.deepcopy(status)

    # ---- reads (GET routes) ----

    def _current(self) -> dict:
        with self._lock:
            return self.frames[self.frame]

    def products(self) -> dict:
        return copy.deepcopy(self.static["api/products"])

    def live(self) -> dict:
        out = copy.deepcopy(self._current()["api/live"])
        live_events, status = self._live_snapshot()
        scripted = sorted(out["events"], key=lambda ev: ev.get("ts") or "", reverse=True)
        # Live events arrive after everything on screen, so they go first.
        out["events"] = [_public(ev) for ev in live_events + scripted][:MAX_LIVE_EVENTS]
        if status:
            out.update(stage=status["stage"], clip_url=status["clip_url"], last_latency_s=status["last_latency_s"])
        return out

    def shopper(self, shopper_id: str) -> dict:
        record = self._current().get(f"api/shopper?shopper_id={shopper_id}")
        if record is None:
            out = {"shopper_id": shopper_id, "opted_in": False, "track_id": None, "nearly_bought": [], "pings": []}
        else:
            out = copy.deepcopy(record)
        with self._lock:
            if shopper_id in self.optins:
                out["opted_in"] = True
                out["track_id"] = self.optins[shopper_id]
            mine = [copy.deepcopy(ev) for ev in self.live_events if ev["shopper_id"] == shopper_id and ev["action"] == "put"]
            pings = copy.deepcopy(self.live_pings.get(shopper_id, []))
        out["nearly_bought"] = mine + out["nearly_bought"]
        out["pings"] = pings + out["pings"]
        return out

    def brand(self, brand_id: str) -> dict:
        frame = self._current()
        record = frame.get(f"api/brand?brand_id={brand_id}")
        if record is None:
            any_brand = next((v for k, v in frame.items() if k.startswith("api/brand?")), {})
            return {
                "brand_id": brand_id,
                "privacy_floor": any_brand.get("privacy_floor", PRIVACY_FLOOR),
                "category_put_rate": any_brand.get("category_put_rate", 0),
                "zones": [],
            }
        out = copy.deepcopy(record)
        live_events, _ = self._live_snapshot()
        floor = out.get("privacy_floor", PRIVACY_FLOOR)
        for zone in out["zones"]:
            here = [ev for ev in live_events if ev["zone_id"] == zone["zone_id"] and ev["brand_id"] == brand_id]
            if here:
                zone["views"] += len(here)
                zone["takes"] += sum(ev["action"] == "take" for ev in here)
                zone["puts"] += sum(ev["action"] == "put" for ev in here)
                zone["shoppers"] += len({ev["track_id"] for ev in here})
                handled = zone["takes"] + zone["puts"]
                zone["put_rate"] = round(zone["puts"] / handled, 2) if handled else 0
            zone["hidden"] = (zone.get("shoppers") or 0) < floor
            if zone["hidden"]:
                zone.update(views=0, takes=0, puts=0, put_rate=0)
        return out

    def store(self) -> dict:
        return copy.deepcopy(self._current()["api/store"])

    def heatmap(self, kind: str) -> dict | None:
        # Static and large (92 x 78 cells): returned as is, never mutated.
        return self.static.get(f"api/heatmap?kind={kind}")

    def price(self, zone_id: str, cpm: float) -> dict | None:
        entry = self.price_entries.get(zone_id)
        if entry is None:
            return None
        endcaps = entry.get("endcaps", DEFAULT_ENDCAPS)
        gbp_week = entry["views_week"] * cpm / 1000
        return {
            "zone_id": zone_id,
            "views_week": entry["views_week"],
            "cpm_gbp": _whole(cpm),
            "gbp_week": round(gbp_week, 2),
            "endcaps": endcaps,
            "gbp_year_store": round(gbp_week * endcaps * WEEKS_PER_YEAR),
            "example": bool(entry.get("example", True)),
        }

    def evidence(self, ref: str) -> dict:
        frame = self._current()
        live_events, _ = self._live_snapshot()
        existing = self.seed.get("evidence", {}).get(ref)
        zone_id, _, metric = ref.partition(":") if ":" in ref else (None, "", "")
        brand_id = None
        zone = None

        if zone_id is not None:
            # A total only gets evidence when its zone is visible to that zone's brand.
            product = next((p for p in self.products_by_id.values() if p["zone_id"] == zone_id), None)
            brand_id = product["brand_id"] if product else None
            view = self.brand(brand_id) if brand_id and f"api/brand?brand_id={brand_id}" in frame else None
            zone = next((z for z in view["zones"] if z["zone_id"] == zone_id), None) if view else None
            if zone is None or zone["hidden"]:
                return {"title": NO_TOTAL_CLIPS, "events": [], "agent_run": None}

        # Live events behind a total: the ones at that zone with the matching action (any action for views).
        live_here = [
            _public(ev) for ev in live_events
            if zone_id is not None and ev["zone_id"] == zone_id and ev["brand_id"] == brand_id
            and (metric == "views" or ev["action"] in METRIC_ACTIONS.get(metric, set()))
        ]

        if existing is not None:
            out = copy.deepcopy(existing)
            out["events"] = [
                _public(ev)
                for ev in out["events"]
                if zone_id is None or (ev["zone_id"] == zone_id and ev["brand_id"] == brand_id)
            ]
            run = out.get("agent_run")
            kept = {ev["event_id"] for ev in out["events"]}
            if run and any(cited not in kept for cited in run.get("cited_event_ids", [])):
                out["agent_run"] = None
            if live_here and metric in METRIC_WORDS:
                out["events"] = live_here + out["events"]
                out["title"] = f"{zone[metric]} {METRIC_WORDS[metric]} this week at {zone_id}"
            return out

        if zone_id is not None:
            if live_here and metric in METRIC_WORDS:
                return {"title": f"{zone[metric]} {METRIC_WORDS[metric]} this week at {zone_id}", "events": live_here, "agent_run": None}
            # A few sample events can't stand in for an aggregate's lineage.
            return {"title": NO_TOTAL_CLIPS, "events": [], "agent_run": None}

        event = next((ev for ev in live_events if ev["event_id"] == ref), None) or \
            next((ev for ev in frame["api/live"]["events"] if ev["event_id"] == ref), None)
        if event is None:
            return {"title": NO_EVENT_CLIP, "events": [], "agent_run": None}
        product = self.products_by_id.get(event["product_id"])
        title = ACTION_WORDS.get(event["action"], "Shelf event")
        if product:
            title += f" · {product['name']}"
        return {"title": title, "events": [_public(event)], "agent_run": None}
