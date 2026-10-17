# Nearly: UI brief

If this reached you as a pasted message, save it as `nearly/web/ASTRA.md` and work only inside `nearly/web/`.

## Context

- VAST Builders Challenge, London, Saturday 17 October 2026. We submit at **15:45**. Feature freeze is **14:30**.
- A separate backend agent builds the API to the contract below. **You are never blocked on it:** build against `mock/seed.json` with `USE_MOCK = true` and switch to the live API when it answers.
- **Freedom line.** This brief locks the structure, flows, interactions and states. The visual layer is yours, built as swappable tokens (Tailwind config plus CSS variables), because the team will restyle from their own references.

## The product

The till only sees what's in the basket. A shelf camera sees what people pick up and put back. Nearly turns one shelf camera into checked events that three people see differently:
- an opted-in shopper gets a "nearly bought" list and a price-drop ping;
- the brand gets totals for its own products only;
- the store gets heatmaps and a price for its shelf space.

The demo ends on the money screen.

The judges are two VAST engineers, one NVIDIA vision researcher and one W&B engineer. They reward:
- the same data shown differently per role;
- evidence behind every number;
- honest "can't tell" states;
- a live moment.

## Stack

- React, Vite, Tailwind and Motion. Single page, hash routes, no router library needed.
- Mobile-first around 390 px for the shopper screen. Every other screen must read at projector scale from the back of a room.
- Vite `base: './'` and relative fetches only, because the app is served under `/app`. Build to `nearly/web/dist`.
- `src/api.js`: one fetch wrapper with `API_BASE = ''` and `USE_MOCK`, settable from `?mock=1` in the URL.
  - In mock mode it reads `mock/seed.json` (copy it into `public/mock/seed.json`) and answers each route from `seed.frames[frame]`, then `seed.static`, then `seed.evidence`, using the exact keys in the seed (e.g. `api/shopper?shopper_id=demo_07`).
  - For `api/price` with any `cpm`, compute `gbp_week = views_week × cpm / 1000` and `gbp_year_store = gbp_week × endcaps × 52` from the static entry.
- Poll every 2 s with `setInterval` and fetch. No websockets.

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

## Screens (from the approved wireframe, in demo order)

Top bar on every screen except Opt-in and Shopper: tabs **Monitor · Shopper · Brand · Store · Price**, plus a small role label ("Viewing as: Brand · Walkers"). Hash routes: `#/optin`, `#/monitor`, `#/shopper`, `#/brand`, `#/store`, `#/price`.

1. **Opt-in** (`#/optin?shopper_id=demo_07`, opened from the QR card on a judge's phone)
   - Content: one line ("Save what you nearly bought today. Only you see it."), and a "Save my list" button that POSTs `api/optin` and then goes to `#/shopper`. Also a "No thanks" link.
   - States: not yet, saving, saved, declined.
2. **Monitor** (`#/monitor`, the screen on the projector)
   - Content:
     - the camera clip (`<video>` of `clip_url`, muted and looping) with shelf zones B2-A/B/C labelled;
     - a pipeline strip: Uploaded → Checking with Cosmos → Saved, driven by `stage`;
     - "Seconds from action to saved event: 27.4" from `last_latency_s`;
     - an event ticker from `events`: time · shopper #track · product name · action · confidence.
   - States: waiting (strip idle), checking (middle step animates), saved (new ticker row slides in, highlighted for 3 s), and `cant_tell` rows shown greyed with "Can't tell", never hidden.
3. **Shopper** (`#/shopper`, phone frame, 390 px)
   - Content:
     - "Nearly bought today": one card per `nearly_bought` event with product name, shelf price, Clubcard price if any, time, and a "Ping me under £x" toggle (UI-only);
     - a ping banner from `pings`;
     - "Delete this visit" (UI-only; confirm inline).
   - States: not opted in ("Scan the QR card to start"), empty ("Nothing nearly bought yet"), **new item lands (the hero: card animates in)**, and ping received.
4. **Brand** (`#/brand`, Walkers' view)
   - Content: per `ZoneStat`, views · pick-ups · put-backs · put-back rate against `category_put_rate`. Every number is clickable and opens the Evidence drawer with `ref = <zone_id>:<metric>`.
   - States: normal, hidden zone ("Not enough shoppers yet to show this", with no numbers), and evidence drawer open.
5. **Store** (`#/store`)
   - Content:
     - a heatmap canvas from `api/heatmap`, with a kind switch (Footfall, Dwell, Attention) and a caption: "NVIDIA synthetic store · 31 people · 13 min", plus "error vs ground truth: x" when `error_vs_truth` isn't null;
     - an alerts list from `api/store`;
     - a before/after card ("Takes went from 21 to 37 after moving it to eye level").
   - States: kind switch, an alert present, `before_after` null (card hidden).
6. **Price** (`#/price`, the last screen of the demo)
   - Content:
     - "End-cap 3 · 18,400 qualified views this week";
     - a CPM input (default £8);
     - **one huge number: £147 a week**;
     - underneath, "£306k a year across 40 end-caps in one store";
     - an "Example numbers" tag while `example` is true.
   - Nothing else competes with the £ figure.

**Evidence drawer** (opens from any brand number or any ticker row with `ref = event_id`): the title, the clips as small looping videos, each event's action and confidence, and the agent run's model, summary and cited event IDs. This is the lineage beat for the VAST judges.

## Copy rules

- Every string is in the product's own voice: short, specific, human, never assistant-speak.
- Money as £ with no pennies above £100.
- Say "put back", not "put". Say "Can't tell from this clip", not "uncertain".
- Never show raw IDs except `#track` in the ticker.

## Demo keys (invisible to judges)

- `L`: next frame. In mock mode, advance `seed.frames`; live, POST `api/demo/step`.
- `G`: jump to the hero (`seed.hero_frame` / `api/demo/hero`).
- `R`: reset (frame 0 / `api/demo/reset`).

They work on every screen.

## PWA pass (last 20 minutes only)

Manifest `display: standalone`, apple meta tags, safe-area padding, no overscroll bounce.

## Assets

`ASTRA_ASSETS.md` lists the assets in priority order:
- zone stickers
- the heatmap component
- the zone overlay and editor
- the QR card
- product tiles
- pitch and video frames
- the app icon

The heatmap and zone overlay are the components the Store and Monitor screens use.

## Do not

- Invent screens.
- Change contract shapes or routes.
- Block on the backend.
- Add login or settings.
- Touch anything outside `nearly/web/`.
