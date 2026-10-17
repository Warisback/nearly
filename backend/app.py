"""Nearly backend: the CONTRACT v1 routes, plus web/dist and clips/ as static files.

The deploy Ingress strips /app, so this app always sees paths from "/". The UI calls them
relatively ("api/live"), which only works if the page URL ends in a slash: see SLASH_FIX.
GET routes never call a model.
"""

from __future__ import annotations

import mimetypes
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import live as live_path
from backend.state import DEMO_BRAND, DEMO_SHOPPER, ROOT, State

DIST = Path(os.environ.get("NEARLY_WEB_DIST") or ROOT / "web" / "dist")
CLIPS = ROOT / "clips"
CLIPS.mkdir(parents=True, exist_ok=True)

# The OS mime table can be wrong (Windows maps .js to text/plain), and browsers refuse
# module scripts served as anything but JavaScript.
for ext, kind in {
    ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".mp4": "video/mp4",
}.items():
    mimetypes.add_type(kind, ext)

# The Ingress maps both /app and /app/ to "/", so the server can't tell them apart. A page at
# /app (no slash) would resolve "api/live" to /api/live, which is VSS's backend on the same host.
SLASH_FIX = (
    "<script data-nearly-slash>(function(){var p=location.pathname;"
    'if(p.slice(-1)!=="/"&&p.split("/").pop().indexOf(".")<0)'
    '{location.replace(p+"/"+location.search+location.hash)}})()</script>'
)
PLACEHOLDER = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Nearly</title></head>
<body style="font-family:system-ui,sans-serif;margin:2rem;line-height:1.6">
<h1>Nearly</h1><p>The backend is up. The screens aren't built yet.</p>
<p><a href="api/live">api/live</a> · <a href="api/shopper?shopper_id=demo_07">api/shopper</a> ·
<a href="api/brand?brand_id=walkers">api/brand</a> · <a href="api/store">api/store</a> ·
<a href="api/price?zone_id=endcap_3&amp;cpm=8">api/price</a></p></body></html>"""
NO_STORE = {"Cache-Control": "no-store"}

state = State()


@asynccontextmanager
async def lifespan(_app):
    stop = live_path.start(state)  # the clips/incoming/ watcher (step 3), when Cosmos is configured
    yield
    if stop:
        stop.set()


app = FastAPI(title="Nearly", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


def ok(data: Any) -> JSONResponse:
    return JSONResponse(data, headers=NO_STORE)


# ---- GET routes (in-memory reads only) ----

@app.get("/api/products")
def products():
    return ok(state.products())


@app.get("/api/live")
def live():
    return ok(state.live())


@app.get("/api/shopper")
def shopper(shopper_id: str = Query(DEMO_SHOPPER, min_length=1, max_length=64)):
    return ok(state.shopper(shopper_id))


@app.get("/api/brand")
def brand(brand_id: str = Query(DEMO_BRAND, min_length=1, max_length=64)):
    return ok(state.brand(brand_id))


@app.get("/api/store")
def store():
    return ok(state.store())


@app.get("/api/heatmap")
def heatmap(kind: Literal["footfall", "dwell", "attention"] = "footfall"):
    data = state.heatmap(kind)
    if data is None:
        raise HTTPException(404, "There is no heatmap of that kind yet.")
    return ok(data)


@app.get("/api/price")
def price(zone_id: str = "endcap_3", cpm: float = Query(8, ge=0, le=100_000)):
    data = state.price(zone_id, cpm)
    if data is None:
        raise HTTPException(404, "There is no price for this shelf yet.")
    return ok(data)


@app.get("/api/evidence")
def evidence(ref: str = Query(..., min_length=1, max_length=128)):
    return ok(state.evidence(ref))


# ---- POST routes ----

class OptIn(BaseModel):
    shopper_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    qr: Any = None


@app.post("/api/optin")
def optin(body: OptIn):
    result = state.optin(body.shopper_id)
    print(f"optin {result}", flush=True)
    return ok(result)


@app.post("/api/demo/step")
def demo_step():
    return ok(_logged("step", state.step()))


@app.post("/api/demo/hero")
def demo_hero():
    return ok(_logged("hero", state.hero()))


@app.post("/api/demo/reset")
def demo_reset():
    return ok(_logged("reset", state.reset()))


def _logged(action: str, position: dict) -> dict:
    print(f"demo {action} -> frame {position['frame']}: {position['label']}", flush=True)
    return position


# ---- static: the UI (web/dist) and our clips ----

def _with_slash_fix(html: str) -> str:
    if "data-nearly-slash" in html:
        return html
    fixed, count = re.subn(r"<head[^>]*>", lambda m: m.group(0) + SLASH_FIX, html, count=1, flags=re.I)
    return fixed if count else SLASH_FIX + html


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/index.html", methods=["GET", "HEAD"], include_in_schema=False)
def index():
    page = DIST / "index.html"
    html = page.read_text(encoding="utf-8") if page.is_file() else PLACEHOLDER
    return HTMLResponse(_with_slash_fix(html), headers={"Cache-Control": "no-cache"})


app.mount("/clips", StaticFiles(directory=CLIPS), name="clips")

# Vite's content-hashed bundles never change, so cache them for good. Everything else is
# unpacked with a 1970 mtime in the pod; without no-cache, browsers keep old copies after a redeploy.
HASHED = re.compile(r"assets/.+-[\w-]{8}\.(js|css)")
SAFE_PATH = re.compile(r"[\w./-]+")


@app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def web(path: str):
    if SAFE_PATH.fullmatch(path) and ".." not in path:
        target = (DIST / path).resolve()
        if target.is_file() and target.is_relative_to(DIST.resolve()):
            cache = "public, max-age=31536000, immutable" if HASHED.fullmatch(path) else "no-cache"
            return FileResponse(target, headers={"Cache-Control": cache})
    raise HTTPException(404, "Not found.", headers=NO_STORE)
