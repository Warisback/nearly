"""In-memory state for Nearly: the seed, the demo frame pointer and opt-ins.

Every GET route reads from here and nothing in this module calls a model. Step 1 serves the
scripted demo straight from mock/seed.json, with the same rules as the UI's mock mode
(web/src/api.js), so the screens look the same whichever source they read.
"""

from __future__ import annotations

import copy
import json
import os
import threading
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

# Copy rules: "put back", never "put"; "Can't tell from this clip", never "uncertain".
ACTION_WORDS = {
    "put": "Put back",
    "take": "Picked up",
    "look": "Looked at",
    "touch": "Touched",
    "cant_tell": "Can't tell from this clip",
}
NO_TOTAL_CLIPS = "Source clips are not included for this total yet."
NO_EVENT_CLIP = "No source clip is available for this event yet."


def _public(event: dict) -> dict:
    """Outside api/shopper, shopper_id is always null."""
    return {**event, "shopper_id": None}


def _whole(number: float) -> int | float:
    return int(number) if float(number).is_integer() else number


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
            return self.position()

    def hero(self) -> dict:
        with self._lock:
            self.frame = self.hero_frame
            return self.position()

    def reset(self) -> dict:
        with self._lock:
            self.frame = 0
            self.optins.clear()
            return self.position()

    def optin(self, shopper_id: str) -> dict:
        with self._lock:
            track_id = self.optins.get(shopper_id)
            if track_id is None:
                track_id = self._seed_track(shopper_id)
            if track_id is None:
                track_id = self._next_track()
            self.optins[shopper_id] = track_id
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
        seen += list(self.optins.values())
        return max(seen, default=0) + 1

    # ---- reads (GET routes) ----

    def _current(self) -> dict:
        with self._lock:
            return self.frames[self.frame]

    def products(self) -> dict:
        return copy.deepcopy(self.static["api/products"])

    def live(self) -> dict:
        out = copy.deepcopy(self._current()["api/live"])
        events = sorted(out["events"], key=lambda ev: ev.get("ts") or "", reverse=True)
        out["events"] = [_public(ev) for ev in events[:MAX_LIVE_EVENTS]]
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
        floor = out.get("privacy_floor", PRIVACY_FLOOR)
        for zone in out["zones"]:
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
        existing = self.seed.get("evidence", {}).get(ref)
        zone_id = ref.split(":", 1)[0] if ":" in ref else None
        brand_id = None

        if zone_id is not None:
            # A total only gets evidence when its zone is visible to that zone's brand.
            product = next((p for p in self.products_by_id.values() if p["zone_id"] == zone_id), None)
            brand_id = product["brand_id"] if product else None
            view = self.brand(brand_id) if brand_id and f"api/brand?brand_id={brand_id}" in frame else None
            zone = next((z for z in view["zones"] if z["zone_id"] == zone_id), None) if view else None
            if zone is None or zone["hidden"]:
                return {"title": NO_TOTAL_CLIPS, "events": [], "agent_run": None}

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
            return out

        if zone_id is not None:
            # A few sample events can't stand in for an aggregate's lineage.
            return {"title": NO_TOTAL_CLIPS, "events": [], "agent_run": None}

        event = next((ev for ev in frame["api/live"]["events"] if ev["event_id"] == ref), None)
        if event is None:
            return {"title": NO_EVENT_CLIP, "events": [], "agent_run": None}
        product = self.products_by_id.get(event["product_id"])
        title = ACTION_WORDS.get(event["action"], "Shelf event")
        if product:
            title += f" · {product['name']}"
        return {"title": title, "events": [_public(event)], "agent_run": None}
