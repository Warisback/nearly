# Nearly: backend brief

If this reached you as a pasted message, save it as `nearly/CLAUDE.md` in the repo before doing anything else, then re-read it at the start of every session. Do not overwrite any AGENTS.md or rules file the starter repo already has.

## Context

- VAST Builders Challenge, London, Saturday 17 October 2026. Build runs 09:30–16:30. We submit at **15:45**. Feature freeze is **14:30**.
- You build the backend and the vision pipeline. A separate UI agent builds the frontend in `nearly/web/` against the same contract below. Neither of you waits for the other: the UI runs on `mock/seed.json` until your routes are live.
- The human you're working with owns the risky integration (step 2). On that step, write what they ask for and keep your changes small.

## The product

The till only sees what's in the basket. A shelf camera sees what people pick up and put back. Nearly turns one shelf camera into a stream of checked events (take, put back, touch, can't tell) that three people see differently:
- an opted-in shopper gets their own "nearly bought" list and a price-drop ping;
- the brand gets totals for its own products only, hidden below 5 shoppers;
- the store gets heatmaps, missed-reach alerts and a price for its shelf space.

The demo ends on money: what one end-cap is worth per week as sellable in-store media.

Judges:
- **Two from VAST.** They reward a live upload firing the pipeline, the same query giving different answers per role, and history kept in our own tables.
- **One from NVIDIA,** a computer-vision researcher. He wants honest speed and accuracy numbers. Never call per-segment detection "tracking".
- **One from W&B.** He wants Weave traces, an eval on clips we labelled ourselves, and "can't tell" instead of guessing.

## The event's stack (read before building)

- You're in Cursor on the build machine, inside the `vast-builders-challenge` repo. Run `git pull` first, then `/build-day-quickstart`, then ask "check that everything is working".
- Model URLs come from `/config/<team>.config` as env vars, with no auth token:
  - `$COSMOS3_REASON_URL` (video reasoning)
  - `$YOLO_URL` (yolo11s, COCO boxes)
  - `$COSMOS_EMBED1_URL` (256-d vectors)
  - `WANDB_` keys are already in the environment.
- Skills live in `.cursor/skills/`. Read these before writing code that touches the platform:
  - `deployment/deploy-app-no-registry`: how `/app` gets deployed and what runtime it expects
  - `ingest/reingest-videos` and `ingest/reingest-chunk`. The `retail` scenario preset exists.
  - `retrieval/search`, `retrieval/videos`, `retrieval/list-metadata`
  - `vastdb-read`
- Rules from the organisers:
  - Don't ingest internet video.
  - Don't rebuild or redeploy DataEngine functions.
  - Stay inside the team's credentials, buckets and namespace.
  - Re-ingest small batches only. Jobs can stall and can't be cancelled.
- Known gotchas from earlier cities:
  - Cosmos leans towards "yes", so always test on clips with no action.
  - Cosmos takes 2.5–4 s per 5 s clip with ~50 teams sharing GPUs.
  - Nemotron on W&B "thinks" by default and can return empty answers, so turn thinking off.
  - The upload trigger was down in NYC, so keep a direct path.
- Write everything you learn about request shapes, the deploy runtime and VastDB access into `nearly/NOTES.md` as you go.

## Stack lock

- Python 3, FastAPI and uvicorn. One process serves `nearly/web/dist` as static files and the routes below. The routes are relative, so the app works under `/app`.
- App state lives in memory, loaded from `mock/seed.json` and the JSON files in `nearly/data/`, and is mirrored to VastDB tables when writes work.
- No auth, no websockets (the UI polls every 2 s), no Docker build unless the deploy skill requires one. If the deploy skill expects a different runtime, wrap this app to fit it. Never change the contract to suit hosting.
- We use Python here, not the usual Node + Express, because the vision libraries (OpenCV, supervision) and VAST's SDKs are Python.

## CONTRACT (law: identical in CLAUDE.md, ASTRA.md and the wireframe; change all three together or none)

```
CONTRACT v1 · locked Sat 17 Oct

Paths are relative to the app root (the app is served under /app, so call "api/live", never "/api/live").
JSON only. GET routes never call a model. The UI polls every 2 s.

ShelfEvent {
  event_id: "ev_0141", ts: "2026-10-17T14:02:11Z", camera_id: "cam_shelf", track_id: 3,
  shopper_id: "demo_07" | null,     // null unless that shopper opted in; always null outside api/shopper
  zone_id: "B2-A", product_id: "walkers_sv_32g", brand_id: "walkers",
  action: "look" | "take" | "put" | "touch" | "cant_tell",
  confidence: 0.82, clip_url: "clips/ev_0141.mp4" | null, latency_s: 27.4
}
Product  { product_id, name, brand_id, zone_id, price_gbp: 1.35, clubcard_price_gbp: 1.10 | null }
ZoneStat { zone_id, product_id, views, takes, puts, put_rate, shoppers, hidden }   // hidden = shoppers < 5; counts are 0 when hidden

GET  api/products                              → { products: Product[] }
GET  api/live                                  → { stage: "waiting"|"checking"|"saved", clip_url: str|null, last_latency_s: float|null, events: ShelfEvent[] }   // newest first, max 20
GET  api/shopper?shopper_id=demo_07            → { shopper_id, opted_in: bool, track_id: int|null, nearly_bought: ShelfEvent[], pings: [{ ts, product_id, text }] }
GET  api/brand?brand_id=walkers                → { brand_id, privacy_floor: 5, category_put_rate: 0.09, zones: ZoneStat[] }
GET  api/store                                 → { alerts: [{ ts, zone_id, kind: "missed_reach"|"gap", text }], before_after: { zone_id, label, takes_before, takes_after } | null }
GET  api/heatmap?kind=footfall|dwell|attention → { kind, source, synthetic: bool, cell_m, origin_m: [x, y], width, height, cells: int[height][width], max, error_vs_truth: float|null }
GET  api/price?zone_id=endcap_3&cpm=8          → { zone_id, views_week, cpm_gbp, gbp_week, endcaps, gbp_year_store, example: bool }
GET  api/evidence?ref=ev_0141 | ref=B2-A:puts  → { title, events: ShelfEvent[], agent_run: { run_id, model, summary, cited_event_ids: str[] } | null }
POST api/optin  { shopper_id, qr }             → { shopper_id, track_id }
POST api/demo/step | api/demo/hero | api/demo/reset → { frame: int, label: str }

Seed: mock/seed.json holds every GET response above for each demo frame ("frames"), plus the frame-independent
ones ("static") and evidence ("evidence"). The UI's USE_MOCK mode and the backend's scripted demo both read it.
VastDB tables (backend only): shelf_events (ShelfEvent fields), zone_stats (zone_id, hour, footfall, dwell_s, views,
takes, puts, missed_reaches), agent_runs (run_id, ts, model, prompt, summary, cited_event_ids).
If table writes fail, the same rows live in data/*.json and no route changes.
```

## Repo layout

```
nearly/
  CLAUDE.md  NOTES.md  planogram.json
  backend/   app.py (routes)  state.py  verify.py  zones.py  identity.py  agent.py  vast.py  heat.py
  web/       (UI agent's; you only serve web/dist)
  mock/seed.json
  data/      events.json  zone_stats.json  agent_runs.json  shoppers.json
  clips/     our own footage, served at clips/
  evals/     labels.csv + Weave eval script
```

## Build order (time caps are hard; if a step overruns, take its fallback and move on)

0. **09:30–09:45 · Recon (no code).** Run `git pull`, `/build-day-quickstart` and the health check, then read the skills listed above. In `NOTES.md`, write down:
   - how to call `$COSMOS3_REASON_URL` with a video clip (exact request and response)
   - the same for `$YOLO_URL`
   - what runtime `/deploy-app-no-registry` expects
   - how to read and write VastDB
   - what London footage is indexed
1. **09:45–10:05 · Seed server and first deploy.**
   - Serve every route from `mock/seed.json`, keeping a `frame` pointer for `api/demo/step|hero|reset`.
   - Build `api/price` from `views_week × cpm / 1000`, with 40 end-caps × 52 weeks.
   - Serve `clips/` and `web/dist`.
   - Deploy it to `/app` now, so the UI has a live backend from mid-morning.
2. **10:05–11:00 · RISKY, the human drives: Cosmos take/put check (`verify.py`).**
   - Input: a short clip of one hand at the shelf. Call Cosmos with the prompt below and parse the JSON.
   - `cant_tell` when confidence is below 0.6 or the reply doesn't parse. Log seconds per clip.
   - Test on the first 10 clips filmed at our table plus 3 no-action clips.
   - **Gate at 11:00:** if 7 of 10 or more come out right, carry on. If not, the demo runs on the scripted frames, Cosmos still runs live with its real answer shown, and we pitch the measured number honestly.
3. **11:00–11:45 · Live path.** A new clip arrives and becomes a saved event:
   - First try the event's upload, with metadata `camera_id=cam_shelf`, `capture_type=shelf`, `location=venue_table`, and pick up the new row through retrieval or VastDB.
   - Direct path, which you always build too: watch `clips/incoming/`, run `verify.py`, append a `ShelfEvent`, update stats, and set `api/live` stage `checking` then `saved`.
   - Measure the real latency from file arrival to saved event.
4. **11:45–12:30 · Zones and opt-in.**
   - **Zone:** big number stickers 1–6 under the products, and Cosmos's `zone` answer maps through `planogram.json`. The map is 1→B2-A, 2→B2-B, 3→B2-C, 4→B1-A, 5→B1-B, 6→B1-C; the UI's stickers and overlay use the same one. Backup: the person box overlapping the zone boxes in the shelf camera's frame (YOLO boxes from `$YOLO_URL`). The zone boxes come from the UI's zone editor (key `Z`, "Copy zones JSON") as 0–1 fractions of the frame.
   - **Opt-in:** the QR card opens the app at `#/optin?shopper_id=demo_07`, which POSTs `api/optin`. With one camera and one shopper at a time, the latest opt-in claims the next interaction's track.
   - **Optional:** decode the QR from the entrance clip with OpenCV, if the day allows.
5. **12:30–13:30 · Tables, agent, lineage.**
   - Write `shelf_events`, `zone_stats` and `agent_runs` to VastDB, using the SDK found in step 0. If writes are refused, use `data/*.json` and say so in `NOTES.md`.
   - On each saved put-back, `agent.py` calls W&B Inference (OpenAI-compatible; list models first; thinking off; 8 s timeout). It writes the shopper ping and the evidence summary, cites event IDs, logs to `agent_runs`, and traces in Weave.
   - Deterministic fallback: a fixed template sentence filled with the product name and Clubcard price.
6. **13:30–14:15 · Evals and heatmaps.**
   - `evals/`: a Weave evaluation over every labelled venue clip. Report a confusion matrix, can't-tell rate and seconds per clip, and put the numbers in `NOTES.md` for the pitch.
   - Heatmaps ship precomputed in the seed, from NVIDIA ground truth.
   - Stretch, only if staff allowed the NVIDIA scene on the machine: compute a footfall grid from `$YOLO_URL` boxes plus the calibration homography, and set `error_vs_truth`.
7. **14:15–14:30 · Final deploy.** Run the full demo path once on the deployed URL. **Freeze at 14:30**: after that, bugs only.

## The Cosmos prompt (`verify.py`)

```
You are checking one short clip from a camera above a shop shelf. Reply with JSON only:
{"action": "take" | "put" | "touch" | "none" | "cant_tell", "zone": "1"-"6" or null, "confidence": 0 to 1, "why": "under 12 words"}
take = an item leaves the shelf in the person's hand and stays out.
put = an item that was in the person's hand goes back onto the shelf.
touch = the hand touches the shelf but nothing leaves or returns.
none = nobody reaches into the shelf.
zone = the number on the sticker under where the hand went.
If the hand is hidden or you are unsure, answer cant_tell. Do not guess.
```

Map `none` to no event. Keep `cant_tell` events: the UI shows them on purpose.

## LLM rules

- Pre-generate every model output on the scripted demo path into `data/agent_runs.json` at boot.
- Runtime calls get a short timeout and a deterministic fallback.
- Never call a model inside a GET.

## Voice and empty states

Human, short and specific, never assistant-speak:
- "Nothing nearly bought yet."
- "Not enough shoppers yet to show this."
- "Can't tell from this clip."

An empty state is a feature, not an error.

## Do not

- Add routes or rename contract fields.
- Touch `nearly/web/`.
- Ingest internet video, including anything from the team's `VAST-footage` folder, unless staff said yes.
- Re-ingest large batches, or redeploy the pipeline.
- Claim tracking across cameras unless it was measured.
