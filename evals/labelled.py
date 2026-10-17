"""Run the Cosmos check over our own labelled clips and score it (the 11:00 gate, and the pitch numbers).

    python evals/labelled.py                 (from nearly/; reads clips/labelled/labels.csv)
    python evals/labelled.py --limit 3       (first three clips only)

labels.csv columns: file,action,zone   (action: take|put|touch|none; zone: sticker 1-6, blank for none)
Prints a confusion matrix, the can't-tell rate, zone accuracy and seconds per clip, and writes every
clip's result to evals/results.csv. One call at a time, as in the live demo.
"""

from __future__ import annotations

import argparse
import csv
import statistics
import sys
from pathlib import Path

NEARLY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(NEARLY))
from backend.verify import verify  # noqa: E402

TRUTHS = ["take", "put", "touch", "none"]
PREDICTED = ["take", "put", "touch", "none", "cant_tell"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(NEARLY / "clips" / "labelled"))
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    folder = Path(args.dir)
    with open(folder / "labels.csv", newline="", encoding="utf-8-sig") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("file")]
    if args.limit:
        rows = rows[:args.limit]

    results = []
    for row in rows:
        truth = row["action"].strip().lower()
        zone = (row.get("zone") or "").strip() or None
        clip = folder / row["file"].strip()
        if truth not in TRUTHS or not clip.is_file():
            print(f"skip {row['file']}: {'unknown action ' + truth if truth not in TRUTHS else 'file missing'}")
            continue
        got = verify(clip)
        results.append({"file": clip.name, "truth": truth, "predicted": got["action"], "confidence": got["confidence"],
                        "zone_truth": zone or "", "zone_predicted": got["zone"] or "", "seconds": got["seconds"],
                        "why": got["why"], "error": got["error"] or ""})
        mark = "right" if got["action"] == truth else "WRONG"
        print(f"{clip.name:<22} truth {truth:<6} said {got['action']:<9} {got['confidence']:.2f}  "
              f"zone {zone or '-'}->{got['zone'] or '-'}  {got['seconds']:>5.1f}s  {mark}  {got['error'] or got['why']}")
    if not results:
        print("No clips scored.")
        return 1

    with open(NEARLY / "evals" / "results.csv", "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(results)

    print("\nConfusion matrix (rows: what happened, columns: what Cosmos said)")
    print(" " * 8 + "".join(f"{p:>10}" for p in PREDICTED))
    for t in TRUTHS:
        counts = [sum(1 for r in results if r["truth"] == t and r["predicted"] == p) for p in PREDICTED]
        if any(counts):
            print(f"{t:<8}" + "".join(f"{c:>10}" for c in counts))

    n = len(results)
    right = sum(r["truth"] == r["predicted"] for r in results)
    cant = sum(r["predicted"] == "cant_tell" for r in results)
    zoned = [r for r in results if r["zone_truth"] and r["predicted"] in ("take", "put", "touch")]
    zone_right = sum(r["zone_truth"] == r["zone_predicted"] for r in zoned)
    secs = sorted(r["seconds"] for r in results)
    print(f"\nRight: {right} of {n} ({right / n:.0%}). Can't tell: {cant} of {n} ({cant / n:.0%}).")
    if zoned:
        print(f"Zone right, when the action was right: {zone_right} of {len(zoned)}.")
    print(f"Seconds per clip: mean {statistics.mean(secs):.1f}, median {statistics.median(secs):.1f}, "
          f"slowest {secs[-1]:.1f}.")
    actions = [r for r in results if r["truth"] != "none"]
    if actions:
        hits = sum(r["truth"] == r["predicted"] for r in actions)
        print(f"Gate (takes and put-backs): {hits} of {len(actions)} right; the brief needs 7 of 10.")
    print("Per-clip results: evals/results.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
