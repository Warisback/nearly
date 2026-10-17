"""Check a running Nearly backend against CONTRACT v1. Standard library only.

    python deploy/smoke.py http://127.0.0.1:8000/
    python deploy/smoke.py http://video-lab-team-<N>.cosmos.vastdata.com/app/ --readonly

Full mode also POSTs api/demo/* and api/optin, walks every seed frame and compares each GET
with the seed, then leaves the demo reset to frame 0. --readonly sends GETs only.
Exit code 0 means every check passed.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

ACTIONS = {"look", "take", "put", "touch", "cant_tell"}
STAGES = {"waiting", "checking", "saved"}
EVENT_KEYS = {"event_id", "ts", "camera_id", "track_id", "shopper_id", "zone_id", "product_id",
              "brand_id", "action", "confidence", "clip_url", "latency_s"}
num = (int, float)
failures: list[str] = []


def check(cond: bool, what: str) -> bool:
    if not cond:
        failures.append(what)
    return cond


def keys(obj, expected: set, where: str) -> bool:
    if not check(isinstance(obj, dict), f"{where}: not an object"):
        return False
    missing, extra = expected - obj.keys(), obj.keys() - expected
    return check(not missing and not extra, f"{where}: missing {sorted(missing)} extra {sorted(extra)}")


def call(base: str, path: str, method: str = "GET", body=None, want: int = 200):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Accept": "application/json", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status, ctype, raw = resp.status, resp.headers.get("Content-Type", ""), resp.read()
    except urllib.error.HTTPError as err:
        status, ctype, raw = err.code, err.headers.get("Content-Type", ""), err.read()
    except OSError as err:
        check(False, f"{method} {path}: {err}")
        return None
    if not check(status == want, f"{method} {path}: HTTP {status}, wanted {want}"):
        return None
    if "json" in ctype:
        return json.loads(raw.decode("utf-8"))
    if path.startswith("api/"):
        check(False, f"{method} {path}: not JSON ({ctype or 'no Content-Type'})")
        return None
    return raw.decode("utf-8", errors="replace")


def event(ev, where: str, shopper_ok: bool = False):
    if not keys(ev, EVENT_KEYS, where):
        return
    check(ev["action"] in ACTIONS, f"{where}: action {ev['action']!r}")
    check(isinstance(ev["track_id"], int), f"{where}: track_id")
    check(isinstance(ev["confidence"], num) and 0 <= ev["confidence"] <= 1, f"{where}: confidence")
    check(ev["clip_url"] is None or isinstance(ev["clip_url"], str), f"{where}: clip_url")
    check(isinstance(ev["latency_s"], num), f"{where}: latency_s")
    check(isinstance(ev["ts"], str) and ev["ts"].endswith("Z"), f"{where}: ts")
    if not shopper_ok:
        check(ev["shopper_id"] is None, f"{where}: shopper_id must be null outside api/shopper")


def validate(base: str) -> dict:
    """GET every route once and check its shape. Returns the bodies by route."""
    got = {}
    p = got["api/products"] = call(base, "api/products")
    if keys(p, {"products"}, "products"):
        for i, prod in enumerate(p["products"]):
            if keys(prod, {"product_id", "name", "brand_id", "zone_id", "price_gbp", "clubcard_price_gbp"}, f"products[{i}]"):
                check(isinstance(prod["price_gbp"], num), f"products[{i}].price_gbp")
                check(prod["clubcard_price_gbp"] is None or isinstance(prod["clubcard_price_gbp"], num), f"products[{i}].clubcard")

    live = got["api/live"] = call(base, "api/live")
    if keys(live, {"stage", "clip_url", "last_latency_s", "events"}, "live"):
        check(live["stage"] in STAGES, f"live.stage {live['stage']!r}")
        check(live["last_latency_s"] is None or isinstance(live["last_latency_s"], num), "live.last_latency_s")
        check(len(live["events"]) <= 20, "live: more than 20 events")
        stamps = [ev.get("ts", "") for ev in live["events"]]
        check(stamps == sorted(stamps, reverse=True), "live: events not newest first")
        for i, ev in enumerate(live["events"]):
            event(ev, f"live.events[{i}]")

    sh = got["api/shopper"] = call(base, "api/shopper?shopper_id=demo_07")
    if keys(sh, {"shopper_id", "opted_in", "track_id", "nearly_bought", "pings"}, "shopper"):
        check(isinstance(sh["opted_in"], bool), "shopper.opted_in")
        check(sh["track_id"] is None or isinstance(sh["track_id"], int), "shopper.track_id")
        for i, ev in enumerate(sh["nearly_bought"]):
            event(ev, f"shopper.nearly_bought[{i}]", shopper_ok=True)
        for i, ping in enumerate(sh["pings"]):
            keys(ping, {"ts", "product_id", "text"}, f"shopper.pings[{i}]")

    br = got["api/brand"] = call(base, "api/brand?brand_id=walkers")
    if keys(br, {"brand_id", "privacy_floor", "category_put_rate", "zones"}, "brand"):
        check(br["privacy_floor"] == 5, "brand.privacy_floor")
        for i, z in enumerate(br["zones"]):
            if keys(z, {"zone_id", "product_id", "views", "takes", "puts", "put_rate", "shoppers", "hidden"}, f"brand.zones[{i}]"):
                check(z["hidden"] == (z["shoppers"] < br["privacy_floor"]), f"brand.zones[{i}]: hidden != shoppers < floor")
                if z["hidden"]:
                    check(z["views"] == z["takes"] == z["puts"] == z["put_rate"] == 0, f"brand.zones[{i}]: hidden zone shows counts")

    st = got["api/store"] = call(base, "api/store")
    if keys(st, {"alerts", "before_after"}, "store"):
        for i, a in enumerate(st["alerts"]):
            if keys(a, {"ts", "zone_id", "kind", "text"}, f"store.alerts[{i}]"):
                check(a["kind"] in {"missed_reach", "gap"}, f"store.alerts[{i}].kind")
        if st["before_after"] is not None:
            keys(st["before_after"], {"zone_id", "label", "takes_before", "takes_after"}, "store.before_after")

    for kind in ("footfall", "dwell", "attention"):
        h = got[f"api/heatmap?kind={kind}"] = call(base, f"api/heatmap?kind={kind}")
        if keys(h, {"kind", "source", "synthetic", "cell_m", "origin_m", "width", "height", "cells", "max", "error_vs_truth"}, f"heatmap {kind}"):
            check(h["kind"] == kind and isinstance(h["synthetic"], bool), f"heatmap {kind}: kind/synthetic")
            check(len(h["cells"]) == h["height"] and all(len(r) == h["width"] for r in h["cells"]), f"heatmap {kind}: cells not height x width")
            check(all(isinstance(c, int) for r in h["cells"] for c in r), f"heatmap {kind}: non-int cell")
            check(len(h["origin_m"]) == 2, f"heatmap {kind}: origin_m")

    pr = got["api/price"] = call(base, "api/price?zone_id=endcap_3&cpm=8")
    if keys(pr, {"zone_id", "views_week", "cpm_gbp", "gbp_week", "endcaps", "gbp_year_store", "example"}, "price"):
        check(abs(pr["gbp_week"] - pr["views_week"] * 8 / 1000) < 0.01, "price.gbp_week != views_week x cpm / 1000")
        check(abs(pr["gbp_year_store"] - pr["gbp_week"] * pr["endcaps"] * 52) < 1, "price.gbp_year_store != gbp_week x endcaps x 52")
        check(pr["endcaps"] == 40, "price.endcaps")

    for ev in (live or {}).get("events", [])[:3]:
        evidence(base, ev["event_id"])
    for z in (br or {}).get("zones", []):
        evidence(base, f"{z['zone_id']}:puts")

    page = call(base, "")
    check(isinstance(page, str) and "data-nearly-slash" in page, "index: slash-fix script missing")
    return got


def evidence(base: str, ref: str):
    from urllib.parse import quote
    e = call(base, f"api/evidence?ref={quote(ref)}")
    if keys(e, {"title", "events", "agent_run"}, f"evidence {ref}"):
        for i, ev in enumerate(e["events"]):
            event(ev, f"evidence {ref}.events[{i}]")
        if e["agent_run"] is not None:
            keys(e["agent_run"], {"run_id", "model", "summary", "cited_event_ids"}, f"evidence {ref}.agent_run")
    return e


def full(base: str):
    seed = call(base, "mock/seed.json")
    if not isinstance(seed, dict):
        check(False, "mock/seed.json not served (UI not built?): skipping seed comparison")
        seed = None
    pos = call(base, "api/demo/reset", "POST")
    check(pos == {"frame": 0, "label": (seed or {}).get("frames", [{}])[0].get("label", pos and pos.get("label"))}, f"reset -> {pos}")
    frames = len(seed["frames"]) if seed else 5
    for f in range(frames):
        if f:
            pos = call(base, "api/demo/step", "POST")
            check(pos and pos.get("frame") == f, f"step -> {pos}, wanted frame {f}")
        got = validate(base)
        if seed:
            frame = seed["frames"][f]
            for route, key in (("api/live", "api/live"), ("api/shopper", "api/shopper?shopper_id=demo_07"),
                               ("api/brand", "api/brand?brand_id=walkers"), ("api/store", "api/store")):
                check(got[route] == frame[key], f"frame {f}: {route} differs from seed")
            for key, value in seed["static"].items():
                route = key if key.startswith("api/heatmap") else key.split("?")[0]
                check(got.get(route) == value, f"frame {f}: {key} differs from seed")
    pos = call(base, "api/demo/step", "POST")
    check(pos and pos.get("frame") == frames - 1, f"step past the end -> {pos}, should stay on the last frame")
    pos = call(base, "api/demo/hero", "POST")
    check(pos and pos.get("frame") == (seed or {}).get("hero_frame", 3), f"hero -> {pos}")
    hero_ev = evidence(base, "ev_0141")
    check(bool(hero_ev and hero_ev.get("agent_run")), "hero: ev_0141 evidence has no agent_run")

    call(base, "api/demo/reset", "POST")
    opt = call(base, "api/optin", "POST", {"shopper_id": "demo_07", "qr": "smoke"})
    check(opt == {"shopper_id": "demo_07", "track_id": 3}, f"optin -> {opt}")
    sh = call(base, "api/shopper?shopper_id=demo_07")
    check(bool(sh and sh.get("opted_in") is True and sh.get("track_id") == 3), "optin: shopper not opted in on frame 0")
    call(base, "api/optin", "POST", {"shopper_id": ""}, want=422)
    call(base, "api/price?zone_id=endcap_3&cpm=-1", want=422)
    call(base, "api/price?zone_id=nowhere&cpm=8", want=404)
    call(base, "api/heatmap?kind=sideways", want=422)
    zero = call(base, "api/price?zone_id=endcap_3&cpm=0")
    check(bool(zero and zero.get("gbp_week") == 0 and zero.get("gbp_year_store") == 0), "price at cpm 0")
    pos = call(base, "api/demo/reset", "POST")
    sh = call(base, "api/shopper?shopper_id=demo_07")
    check(bool(pos and pos.get("frame") == 0 and sh and sh.get("opted_in") is False), "reset: frame 0 and opt-ins cleared")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", help="app root, ending in / (e.g. http://127.0.0.1:8000/)")
    ap.add_argument("--readonly", action="store_true", help="GETs only; don't move the demo")
    args = ap.parse_args()
    base = args.base if args.base.endswith("/") else args.base + "/"
    if args.readonly:
        validate(base)
    else:
        full(base)
    if failures:
        print(f"FAIL: {len(failures)} problem(s) at {base}")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print(f"OK: every contract check passed at {base} ({'GETs only' if args.readonly else 'all frames, demo reset to 0'})")


if __name__ == "__main__":
    main()
