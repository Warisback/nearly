# Nearly: assets brief for Astra

**Make the zone stickers first, because filming starts at 10:00 and Cosmos reads them. Then the heatmap, then the zone overlay, then the QR card. Pitch and video assets come after lunch.**

If this reached you as a pasted message, save it as `nearly/web/ASTRA_ASSETS.md`. It adds to `nearly/web/ASTRA.md` and doesn't replace it: same contract, same tokens, same rule of working only inside `nearly/web/`.

## Paste-in prompt (for Astra)

```
Read nearly/web/ASTRA.md, then nearly/web/ASTRA_ASSETS.md. Build the assets in ASTRA_ASSETS.md in the order listed, one at a time, and tell me when each is done so I can check it. Start with the zone stickers: I need to print them before 10:00. Use the data already in mock/seed.json. Don't change the contract and don't touch anything outside nearly/web.
```

## What you have to work with

- `mock/seed.json` → `static["api/heatmap?kind=footfall|dwell|attention"]`. These are real numbers, computed from NVIDIA's synthetic store (PhysicalAI-SmartSpaces scene 071, CC BY 4.0).
  - Grid: `width` 78 × `height` 92 cells, `cell_m` 0.5, so the floor is 39 m × 46 m. `origin_m` [-19, -22] is the bottom-left corner in metres.
  - `cells[row][col]`: row 0 is the **bottom** of the floor (lowest y), so draw it bottom-up. Use the same orientation for all three kinds.
  - Values are seconds, sampled once per second over 13.3 min of 31 people:
    - **footfall:** seconds anyone spent in that 0.5 m square;
    - **dwell:** seconds spent standing still there;
    - **attention:** seconds of standing gaze landing there, projected 1 m ahead of the way each person faces.
  - Values are heavily skewed (max about 370, most cells under 20). Use a square-root or log colour scale, or the map is one hot dot.
  - There's no floor-plan image. Footfall cells with a value of 0 are shelving, walls or space nobody walked, so draw them as the "fixtures" colour and the rest as floor. That gives you a floor plan for free.
- `static["api/products"]`: the 6 products and their zones (B2-A, B2-B, B2-C on the upper shelf; B1-A, B1-B, B1-C on the lower).
- Sticker-to-zone map (the backend uses the same one in `planogram.json`):

  | Sticker | Zone |
  |---|---|
  | 1 | B2-A |
  | 2 | B2-B |
  | 3 | B2-C |
  | 4 | B1-A |
  | 5 | B1-B |
  | 6 | B1-C |

## Assets, in order

**1. Zone stickers** · `public/print/zone-stickers.html` · *needed by 09:55*
- A4 portrait, six squares about 7 cm wide, each holding one huge number (1–6). Use heavy weight, black on white, a thick border and no decoration. A camera 2 m above has to read them.
- A small line under each number gives its zone (e.g. "B2-A"), with a dashed cut line around each square.
- Print-ready: `@page` A4, no margins lost, nothing else on the page.
- If there's no printer at the venue, the team writes 1–6 by hand in thick marker, so don't block on this.

**2. Heatmap** · `src/components/Heatmap.jsx`, used on the Store screen
- Canvas renderer for any `api/heatmap` response:
  - floor and fixtures as above;
  - the colour scale from your tokens (sequential, one hue family, readable on the projector);
  - a legend in seconds;
  - a 5 m scale bar;
  - a caption: "NVIDIA synthetic store · 31 people · 13 min". Add "· error vs ground truth: x m" when `error_vs_truth` isn't null.
- Kind switch: Footfall · Dwell · Attention. Crossfade between kinds, and keep the floor fixed so the change reads.
- Hover or tap a cell to show "x s in this 0.5 m square".
- Mark the 3 hottest attention cells with small numbered pins ("1", "2", "3") and list them beside the map as "Most looked-at spots".
- An "Export PNG" button (dev only, hidden with `?clean=1`) that saves 1920×1080 PNGs of each kind for the slides and video.

**3. Shelf zone overlay** · `src/components/ZoneOverlay.jsx`, on the Monitor screen
- Draws the six zones over the camera clip as labelled boxes (sticker number + product name), using normalised coordinates (0–1 of the video frame) kept in `src/zones.json`.
- A hidden edit mode (key `Z`): drag and resize the boxes over the real frame, then "Copy zones JSON" so the team can paste it to the backend's `planogram.json`. They line this up once the phone is mounted at about 10:00.
- When a new event lands in `api/live`, flash that event's zone box for 2 s: green for take, amber for put back, grey for can't tell.

**4. QR opt-in card** · `public/print/optin-card.html`
- A6 card: a QR code pointing to `APP_URL + "#/optin?shopper_id=demo_07"`. `APP_URL` is a constant at the top of the file; the team pastes the deployed `/app` URL in at about 10:00.
  - Generate the QR in the page with an npm package (`qrcode`).
  - Card text: "Scan to save what you nearly bought today. Only you see it." Small print: "Opt in for this visit only. No face recognition."
- Also render the same card full-screen at `#/qr`, so it can be shown on a phone or laptop if nothing prints.

**5. Product tiles** · `src/components/ProductTile.jsx`
- Uses `public/products/<product_id>.jpg` if a photo exists. The team photographs the 6 real products at the table and drops the photos in.
- Otherwise falls back to a clean typographic tile: product name, price, and a colour block per brand.
- No brand logos drawn by you.
- Used on the Shopper cards, the ticker and the Brand screen.

**6. Pitch and video assets** · `public/pitch/` · *after 13:00*
- Every frame is 1920×1080 HTML, made for screen-recording, using the same tokens:
  - `title.html`: "Nearly", plus the line "The till sees what's in the basket. The shelf sees what was nearly bought."
  - `how-it-works.html`: the nine data-flow steps from the wireframe as one left-to-right diagram: camera → VAST ingest → detect and track → floor and shelf map → Cosmos checks it → opt-in identity → event tables → permissioned views → agent acts. Tag each step VAST/NVIDIA stack, or "we built".
  - `three-views.html`: one put-back event in the middle, fanning out to three panels (Shopper: "on your list", Brand: "+1 put-back, totals only", Store: "heatmap"). This is the permissions beat.
  - `end.html`: the money screen as a still. "End-cap 3 · £147 a week", "£306k a year across 40 end-caps in one store", and an "Example numbers" tag. The final frame of the video.
  - Heatmap stills: the three PNGs from asset 2.

**7. App icon** · *last 20 minutes, with the PWA pass*
- A simple mark in the token colours at 192, 512 and apple-touch sizes, plus a favicon.

## Done means

Each asset is:
- built from the seed or the live API;
- legible from the back of a room;
- styled through the shared tokens;
- checked once on the projector or a phone.

Tell the team when each is done, and don't polish one asset while a higher one is unfinished.
