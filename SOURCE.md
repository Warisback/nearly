# Nearly: where everything is, and your three jobs

You have three jobs today: **make the store heatmap readable on a projector, set up the demo at the table, and clean the demo data.** Each job below lists the files, a checklist, how to check your work, and a prompt you can paste into your coding agent.

Times: **feature freeze 14:30, submit by 15:45**, hard deadline 16:30 BST. The event's one rule about code is "Build your project during the event."

## Two rules before you touch anything

1. **The CONTRACT is fixed.** It's the block in `CLAUDE.md` and `web/ASTRA.md`. Never rename a field or add a route.
2. **Stay in your lane.** Your work is in `web/` (heatmap, screens, assets) and the demo data, `mock/seed.json` and its copy.
   - Leave `backend/`, `main.py`, `deploy/` and `NOTES.md` to the backend side, and ask if you need something there.
   - Don't touch the ids the code and tests depend on (see job 3).

## Repo map

Paths in this table are relative to the `nearly/` folder. Commands below start one level up, in the folder that contains `nearly/`.

| Path | What it is | Owner |
|---|---|---|
| `CLAUDE.md` | Backend brief, with the CONTRACT | backend |
| `NOTES.md` | What the backend learned: model calls, deploy, VastDB, event facts | backend |
| `SOURCE.md` | This guide | you |
| `main.py`, `requirements.txt` | Starts the backend (`python main.py`) | backend |
| `backend/app.py`, `backend/state.py` | The API routes; serves `web/dist` and `clips/` | backend |
| `deploy/deploy.sh`, `deploy/package.py`, `deploy/smoke.py` | Deploy to the event cluster at `/app`, plus the contract check | backend |
| `mock/seed.json` | **The demo data.** Every API answer, for each of the 5 demo frames | you, for job 3 |
| `clips/` | Our own filmed clips, served at `clips/…` | you, for job 2 |
| `web/ASTRA.md`, `web/ASTRA_ASSETS.md` | UI brief and assets brief | UI |
| `web/src/App.jsx` | Routes: `#/monitor`, `#/shopper`, `#/brand`, `#/store`, `#/price`, `#/optin`, `#/qr` | UI |
| `web/src/api.js` | Fetches from the backend, or from the seed with `?mock=1` | UI |
| `web/src/screens/*.jsx` | One file per screen | UI |
| `web/src/components/Heatmap.jsx` + `Heatmap.css` | **The heatmap** (job 1) | you |
| `web/src/components/ZoneOverlay.jsx`, `web/src/zones.json` | The six shelf boxes over the camera picture | you, for job 2 |
| `web/public/mock/seed.json` | The UI's copy of the seed. **Must stay identical to `mock/seed.json`** | you |
| `web/public/print/zone-stickers.html`, `web/public/print/optin-card.html` | Print sheets: stickers 1–6 (A4) and the QR card (A6) | you, for job 2 |
| `web/public/pitch/*.html`, `web/public/pitch/heatmap-*.png` | 1920×1080 slides and stills for the video | you |
| `web/scripts/export_heatmaps.py` | Regenerates the three heatmap PNGs from the seed | you, for job 1 |
| `web/scripts/test-api.mjs` | UI data checks (`npm test`) | UI |

The heatmap numbers come from NVIDIA's PhysicalAI-SmartSpaces scene 071 (CC BY 4.0). The attribution is in `SOURCE.md` at the top of the prep folder, and the raw files are in `C:\Users\yussu\VAST-footage\nvidia-smartspaces\scene_071` on the laptop.

## Run it

**UI only, with the seed's data and hot reload:**
```bash
cd nearly/web
npm install          # once
npm run dev          # http://127.0.0.1:5173/?mock=1#/monitor
```

- `?mock=1&frame=3` opens on the hero frame. `#/store?kind=attention` opens one heatmap. `?clean=1` hides the dev-only Export PNG button.
- Demo keys work on every screen: **L** next frame, **G** hero, **R** reset.

**The whole app, the way the deployed version runs:**
```bash
cd nearly/web && npm run build                                # writes web/dist
cd .. && pip install -r requirements.txt && python main.py    # http://127.0.0.1:8000/#/monitor
```
With no `?mock=1`, the UI calls the backend. The backend serves the same five frames from `mock/seed.json`, and the keys move them.

**Checks** (run both before you hand anything back; each line starts from the folder that contains `nearly/`):
```bash
cd nearly/web && npm test                                    # UI data layer against the seed
cd nearly && python deploy/smoke.py http://127.0.0.1:8000/   # backend against the CONTRACT and the seed (needs python main.py running; resets the demo)
```

---

## Job 1: make the heatmap read on a projector

**Where it is:**
- `web/src/components/Heatmap.jsx` draws the map on a canvas; `Heatmap.css` styles it.
- `web/src/screens/Store.jsx` fetches the three maps and holds the Footfall · Dwell · Attention switch.

**The data:** `api/heatmap?kind=footfall|dwell|attention`, from `mock/seed.json` → `static`.
- 78 × 92 squares of 0.5 m each, so the floor is 39 × 46 m. Row 0 is the **bottom** of the floor.
- Each value is seconds over 13.3 minutes with 31 people:
  - **footfall:** time spent in that square;
  - **dwell:** time standing still there;
  - **attention:** time of standing gaze landing there, 1 m ahead of where each person faces.
- A footfall value of 0 means shelving, a wall or untouched floor. That gives us a floor plan for free.

**The problem:** most squares hold under 20 s, but the peak is about 370 s. The current colour ramp (square root, light mint to dark teal) leaves most of the floor pale on a projector.

**Ideas, in order of payoff:**
1. **Clip the top of the scale**, for example at the 95th–98th percentile of the non-zero squares, so the busy aisles go dark. The legend must then say so honestly: "0 s … 60 s+".
2. A log scale, or a stronger, darker low end, in the same colour family (use the tokens in `public/tokens.css`).
3. More contrast between floor, fixtures and heat. Fixtures can be a mid grey-green, so the floor plan reads before any heat does.
4. Make the three numbered "most looked-at" pins bigger and easier to see.

**Keep:**
- the caption "NVIDIA synthetic store · 31 people · 13 min";
- the 5 m scale bar, the hover tooltip ("x s in this 0.5 m square") and the legend in seconds.

**Don't:**
- edit the numbers in the seed;
- change the API shape.

**Done means:** at 1920×1080, with the browser full screen (F11), all three kinds read from the back of the room, and the floor plan stays visible.

**Then refresh the stills:**
- Use the in-app **Export PNG** button on each kind (it saves 1920×1080 PNGs; copy them over `web/public/pitch/heatmap-*.png`).
- Or run `python web/scripts/export_heatmaps.py`. It needs Pillow and Windows fonts. **If you change the colour scale, change it in that script too**, or the slides won't match the app.

**Stretch (only if staff allowed the NVIDIA scene on the build machine):**
- compute footfall from YOLO person boxes plus each camera's floor homography (`calibration.json`);
- compare it with the ground truth and fill `error_vs_truth`.
- The Store screen already shows "error vs ground truth: x m" when it's set. Talk to the backend side first, because it's an API field.

**Paste into your coding agent:**
```
Read nearly/SOURCE.md (Job 1) and nearly/web/ASTRA_ASSETS.md (asset 2). Improve nearly/web/src/components/Heatmap.jsx and Heatmap.css so the store heatmap reads on a projector at 1920x1080: clip the colour scale at a high percentile of the non-zero squares (with an honest "+" on the legend's top value), make floor, fixtures and heat clearly different, and make the three "most looked-at" pins easier to see. Use the colour tokens in public/tokens.css. Don't change the seed data or the API shape. Keep the caption, scale bar, tooltip and legend. Check all three kinds at http://127.0.0.1:5173/?mock=1#/store?kind=footfall (and dwell, attention). Then update scripts/export_heatmaps.py to use the same colour scale and regenerate public/pitch/heatmap-*.png. Run npm test.
```

---

## Job 2: set up the demo at the table

### Physical set-up
- [ ] **Stickers:** print `web/public/print/zone-stickers.html` (A4) and stick 1–6 under the products. Thick marker on card works if there's no printer. Cosmos reads these numbers, so keep them big and in view.

  | Sticker | Zone | Where on the shelf |
  |---|---|---|
  | 1 | B2-A | Top shelf, left |
  | 2 | B2-B | Top shelf, middle |
  | 3 | B2-C | Top shelf, right |
  | 4 | B1-A | Bottom shelf, left |
  | 5 | B1-B | Bottom shelf, middle |
  | 6 | B1-C | Bottom shelf, right |

- [ ] **Camera:** a phone about 2 m above the shelf, pointing down, with all six stickers in frame. Don't move it after the zones are lined up.
- [ ] **Products:** six real products, one per sticker. Their names and prices go into the seed (job 3).
- [ ] **Product photos (optional, they look great):** `web/public/products/<product_id>.jpg`.
  - Keep each about 400 px wide and 30 KB: `ffmpeg -i photo.jpg -vf scale=400:-2 -q:v 6 walkers_sv_32g.jpg`.
  - The whole deploy bundle has to stay under 700 KB, and the deploy refuses bigger.
  - Without a photo, each product shows a clean text tile.
- [ ] **Line up the zones:**
  1. Open the Monitor (`#/monitor`) and press **Z**.
  2. Drag and resize the six boxes over the real camera picture, then press **Copy zones JSON**.
  3. Paste it into `web/src/zones.json` and rebuild.
  4. Tell the backend side, which maps Cosmos's sticker answer through the same table.
- [ ] **QR card:**
  1. After the first deploy, open the lab page and click **App**. At earlier events that opened `https://team-<N>-app.thecosmoslabs.com/app/`.
  2. Paste that URL into `APP_URL` at the top of `web/public/print/optin-card.html`, then print it (A6).
  3. No printer? Show `#/qr` full screen on a laptop or phone.
  4. **Test it on a phone on mobile data first:** one team at NYC hit a sign-in on that link.

### Clips to film (by about 10:30, while the light is the same as the demo)
- [ ] **The four ticker clips the seed already points at**, so the Monitor and the evidence drawer show real video, saved into `clips/`:

  | File | What happens in it |
  |---|---|
  | `ev_0141.mp4` | **The hero**: pick up the product at sticker 1, look at it, put it back |
  | `ev_0140.mp4` | A hand half-hidden at sticker 5 (this is the "can't tell" row) |
  | `ev_0139.mp4` | Take the product at sticker 4 |
  | `ev_0138.mp4` | Someone looks at sticker 3 without touching it |

  Re-encode each one so it plays in every browser: `ffmpeg -i in.mov -t 6 -vf scale=1280:-2 -an -c:v libx264 -pix_fmt yuv420p -crf 26 -movflags +faststart ev_0141.mp4`. Keep each under about 5 MB.
- [ ] **The labelled set for the 11:00 Cosmos gate:** 10 takes, 10 put-backs and 3 clips with no action, 3–6 s each, one hand at the shelf.
  - Save them in `clips/labelled/`.
  - Write `clips/labelled/labels.csv` as you go, with columns `file,action,zone`:
    - `action` is one of `take`, `put`, `touch`, `none`;
    - `zone` is the sticker number 1–6, or blank for `none`.
  - Example row: `clip_07.mp4,put,1`.

### The live moment (a real clip becomes a saved event)

Run the app on the laptop with `nearly/.env` holding the team's `COSMOS3_REASON_URL` and `GPU_BEARER_TOKEN`:
```bash
cd nearly && python main.py    # prints "live: watching …\clips\incoming"
```

1. The judge picks something up and puts it back.
2. Film 3–6 s with the shelf phone, and drop the clip into `nearly/clips/incoming/`.
   - The OneDrive phone app can upload straight into that folder, because it's inside OneDrive.
   - Or copy it over USB.
3. The Monitor shows "Checking with Cosmos", then the saved event with the real seconds.
4. If the judge opted in first, the card and the ping land on their phone.

Press **R** before the next judge.

The judges' phones can't reach `127.0.0.1`. For the QR, either deploy (above), or ask the backend side to open a public tunnel from the laptop; then open `#/qr` on that tunnel URL.

### The demo, in order (keys: **L** next frame, **G** hero, **R** reset)

| Frame | Label in the seed | What the screens show |
|---|---|---|
| 0 | Before the judge arrives | Monitor: three earlier moments, one marked "Can't tell from this clip". Shopper: "Scan the QR card to start" |
| 1 | Judge scans the QR card | Shopper: opted in, "Nothing nearly bought yet." |
| 2 | Judge picks up the crisps and puts them back; clip uploading | Monitor: "Checking with Cosmos" |
| 3 | **HERO**: put-back saved | Monitor: saved, with the latency. Shopper: the card lands. Brand: put-backs 6 → 7 |
| 4 | Price-drop ping reaches the shopper | Shopper: the £1.10 Clubcard ping. Store: the missed-reach alert |

**Projector:** open the App URL with `?clean=1` before the `#`, e.g. `…/app/?clean=1#/monitor`, so the dev-only Export PNG button stays hidden. Go full screen with F11 at 1920×1080.

Suggested walk-through (it must end on the money):
1. **Monitor** on the projector.
2. The judge scans the QR card, opts in on their phone, and sees the Shopper screen.
3. Press **L**: checking.
4. Press **G**: the hero lands on the Monitor and on the phone.
5. **Brand:** click "Put-backs" to open the evidence drawer (clip, confidence, agent summary).
6. **Store:** heatmap kinds, then the alert.
7. Press **L**: the ping arrives.
8. **Price:** end on the £ figure.

**For video takes:**
- `?mock=1&frame=N` opens any frame with no backend, and `?clean=1` hides dev buttons.
- The pitch slides in `web/public/pitch/` are 1920×1080 for screen recording.
- Record the voiceover separately.

---

## Job 3: clean the demo data

**Where:** `mock/seed.json`, with an identical copy in `web/public/mock/seed.json`.
- The backend serves the first, and the UI's `?mock=1` mode reads the second.
- After every edit, copy it across: `cp nearly/mock/seed.json nearly/web/public/mock/seed.json`.

**Shape:**
- `static`: products, three heatmaps, price.
- `frames`: five frames, each holding `api/live`, `api/shopper?shopper_id=demo_07`, `api/brand?brand_id=walkers` and `api/store`.
- `evidence`: two entries.
- `hero_frame`: 3.

**Keep these exactly** (the code and the tests depend on them):
- `demo_07` and its `track_id` 3
- `walkers` as the brand on the Brand screen
- `ev_0141` as the hero event
- five frames, with `hero_frame` 3
- the zone ids `B2-A` … `B1-C`
- `endcap_3`, with `views_week` 18400 and `endcaps` 40

If you need to change one of these, **ask first**: `npm test` and `deploy/smoke.py` check them on purpose.

**Checklist:**
- [ ] **Products** (`static["api/products"]`): change `name`, `price_gbp` and `clubcard_price_gbp` (or `null`) to the six real products.
  - Each product's `zone_id` is the zone of the sticker it sits above.
  - Easiest: keep the `product_id`s. If you change one, change **every** place it appears: events in all five frames, the brand `zones`, `evidence`, ping `product_id` and text, and the photo file name.
- [ ] **Ping text** (frame 4) must match the real Clubcard price and aisle: "… is £1.10 with Clubcard today. Still in aisle 2."
- [ ] **Raw ids in text:** judges should never read "B2-A".
  - Rewrite the alert text (frame 4) and the evidence titles with places: "…at B1-C (Innocent Orange Juice)…" becomes "…on the bottom shelf, right (Innocent Orange Juice)…".
  - Use "put back", never "put".
- [ ] **One known contradiction:** `evidence["B2-A:puts"]` says "7 put-backs this week", but on frames 0–2 the Brand screen shows 6. Either drop the count from that title ("Put-backs this week, top shelf left") or only click that number after the hero.
- [ ] **Keep honest flags:**
  - `example: true` on the price, the "(example)" in the before/after label, and `synthetic: true` on the heatmaps all stay until real numbers replace them.
- [ ] **Consistency rules:**
  - Timestamps are UTC (`…Z`); the screens show London time.
  - `api/live` events are newest first.
  - `confidence` is between 0 and 1.
  - `shopper_id` is `null` everywhere except inside `api/shopper`.
  - Hidden zones (shoppers < 5) have zero counts.
- [ ] **Labels for the Cosmos gate:** in `clips/labelled/labels.csv`, every `file` must exist; `action` must be take, put, touch or none; `zone` must be 1–6. One row per clip, no duplicates.

**Check:** run `npm test`, then `python main.py` and `python deploy/smoke.py http://127.0.0.1:8000/`. Smoke compares every frame the backend serves against the seed. Then click through all five frames with **L**.

**Paste into your coding agent:**
```
Read nearly/SOURCE.md (Job 3) and the CONTRACT block in nearly/CLAUDE.md. Update nearly/mock/seed.json for our six real products: <paste names, prices, Clubcard prices and which sticker each sits above>. Keep the ids listed under "Keep these exactly". Rewrite any user-facing text that contains a raw zone id (B1-C etc.) using shelf places, say "put back" not "put", and fix the B2-A:puts evidence title so it doesn't contradict frames 0-2. Don't change field names or shapes. Copy the result to nearly/web/public/mock/seed.json, then run `npm test` in nearly/web and fix anything you broke.
```

---

## Copy rules (for anything a judge can read)

- Write short, human and specific. No assistant-speak.
- Money in £, with no pennies above £100 (£147, not £147.20).
- "put back", not "put". "Can't tell from this clip", not "uncertain".
- No raw ids on screen (`demo_07`, `walkers_sv_32g`, `ev_0141`); the only exception is the "#track" number in the ticker.
- Empty states are features: "Nothing nearly bought yet." "Not enough shoppers yet to show this."
