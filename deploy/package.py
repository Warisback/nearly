"""Build the folder that becomes the app's ConfigMap: main.py, requirements.txt, nearly.tgz.

deploy-app-no-registry mounts ONE ConfigMap at /code, and `kubectl create configmap --from-file=DIR`
keeps top-level files only, so web/dist/assets/ and backend/ would be dropped. Everything with
subfolders therefore travels inside nearly.tgz, which main.py unpacks at start. Video clips don't
fit in a ConfigMap; deploy.sh copies them into the running pod instead.

Usage, from nearly/:  python deploy/package.py      (prints the folder; exits 1 if it can't ship)
Set ALLOW_NO_UI=1 to ship the backend without a built UI (/ then shows a placeholder).
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
import shutil
import sys
import tarfile
from pathlib import Path

NEARLY = Path(__file__).resolve().parent.parent
OUT = NEARLY / "deploy" / "build" / "configmap"
DIST = NEARLY / "web" / "dist"
BUNDLE = ["backend", "web/dist", "mock/seed.json", "data", "planogram.json"]
SKIP_DIRS = {"__pycache__", ".pytest_cache", "node_modules", "incoming"}
SKIP_SUFFIXES = {".pyc", ".map", ".mp4", ".mov", ".webm", ".avi", ".mkv"}
# The API server allows 1 MiB of decoded data + binaryData per ConfigMap (server-side apply
# avoids the 256 KiB annotation cap of client-side apply). Keep 16 KiB for the object itself.
CONFIGMAP_LIMIT = 1024 * 1024 - 16 * 1024


def bundle_files() -> list[Path]:
    files = []
    for rel in BUNDLE:
        path = NEARLY / rel
        candidates = [path] if path.is_file() else sorted(path.rglob("*")) if path.is_dir() else []
        for f in candidates:
            parts = f.relative_to(NEARLY).parts
            if not f.is_file() or set(parts) & SKIP_DIRS or f.suffix.lower() in SKIP_SUFFIXES:
                continue
            # The pitch stills are for slides and video; no page in the app loads them.
            if parts[:3] == ("web", "dist", "pitch") and f.suffix.lower() == ".png":
                continue
            files.append(f)
    return files


def build_tgz(files: list[Path]) -> bytes:
    """Same input -> same bytes (no timestamps or owners), so unchanged code means no restart."""
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for f in files:
            data = f.read_bytes()
            info = tarfile.TarInfo(f.relative_to(NEARLY).as_posix())
            info.size, info.mode, info.mtime = len(data), 0o644, 0
            tar.addfile(info, io.BytesIO(data))
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0, compresslevel=9) as gz:
        gz.write(raw.getvalue())
    return out.getvalue()


def newest_mtime(*paths: Path) -> float:
    files = [f for p in paths for f in ([p] if p.is_file() else p.rglob("*")) if f.is_file()]
    return max((f.stat().st_mtime for f in files), default=0)


def clip_urls(node) -> set[str]:
    if isinstance(node, dict):
        own = {node["clip_url"]} if isinstance(node.get("clip_url"), str) else set()
        return own.union(*(clip_urls(value) for value in node.values()))
    if isinstance(node, list):
        return set().union(*(clip_urls(value) for value in node))
    return set()


def warnings() -> list[str]:
    """Things that ship fine but would surprise someone in the demo."""
    notes = []
    index = DIST / "index.html"
    web = NEARLY / "web"
    if index.is_file() and newest_mtime(web / "src", web / "public", web / "index.html") > index.stat().st_mtime:
        notes.append("web/dist is older than web/src or web/public: run `npm run build` in web/ first")
    seed = json.loads((NEARLY / "mock/seed.json").read_text(encoding="utf-8-sig"))
    ui_seed = DIST / "mock" / "seed.json"
    if ui_seed.is_file() and json.loads(ui_seed.read_text(encoding="utf-8-sig")) != seed:
        notes.append("mock/seed.json and the UI's copy differ: cp mock/seed.json web/public/mock/seed.json, then rebuild the UI")
    missing = sorted(name for name in {Path(url).name for url in clip_urls(seed)} if not (NEARLY / "clips" / name).is_file())
    if missing:
        notes.append(f"clips the seed points at but clips/ doesn't have (the screens show the illustration): {', '.join(missing)}")
    photos = {f.name.lower(): f.name for f in (DIST / "products").glob("*")} if (DIST / "products").is_dir() else {}
    for product in seed["static"]["api/products"]["products"]:
        wanted = f"{product['product_id']}.jpg"
        if wanted not in photos.values() and wanted.lower() in photos:
            notes.append(f"rename products/{photos[wanted.lower()]} to {wanted} (the pod is case-sensitive)")
    return notes


def main() -> int:
    if not (DIST / "index.html").is_file() and os.environ.get("ALLOW_NO_UI") != "1":
        print("web/dist/index.html is missing: run `npm run build` in web/ first (or set ALLOW_NO_UI=1).")
        return 1
    files = bundle_files()
    tgz = build_tgz(files)
    total = len(tgz) + (NEARLY / "main.py").stat().st_size + (NEARLY / "requirements.txt").stat().st_size
    if total > CONFIGMAP_LIMIT:
        biggest = sorted(files, key=lambda f: f.stat().st_size, reverse=True)[:8]
        print(f"The ConfigMap would hold {total // 1024} KB; the cluster allows {CONFIGMAP_LIMIT // 1024} KB.")
        print("Biggest files:", *(f"  {f.stat().st_size // 1024:>5} KB  {f.relative_to(NEARLY).as_posix()}" for f in biggest), sep="\n")
        print("Shrink photos to 400 px wide, e.g.  ffmpeg -i in.jpg -vf scale=400:-2 -q:v 6 out.jpg  (about 30 KB each).")
        return 1

    # Empty the folder rather than delete it: OneDrive or an open Explorer window can hold it.
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.iterdir():
        old.unlink()
    (OUT / "nearly.tgz").write_bytes(tgz)
    shutil.copyfile(NEARLY / "main.py", OUT / "main.py")
    shutil.copyfile(NEARLY / "requirements.txt", OUT / "requirements.txt")

    digest = hashlib.sha256()
    for f in sorted(OUT.iterdir()):
        digest.update(f.name.encode() + f.read_bytes())
    (OUT.parent / "code-hash").write_text(digest.hexdigest()[:16])
    print(f"{OUT.relative_to(NEARLY).as_posix()}: {len(files)} files in nearly.tgz, {total // 1024} KB "
          f"(limit {CONFIGMAP_LIMIT // 1024} KB), code hash {digest.hexdigest()[:16]}")
    for note in warnings():
        print(f"WARNING: {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
