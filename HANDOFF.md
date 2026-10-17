# Handoff: what's left

**Nothing has run on the build machine yet. Your first job is getting into the lab at workshop.thecosmoslabs.com. Then do the NOTES.md section 0 checks and deploy.**

You own every decision from here, including the risky Cosmos check.
- [`CONCEPT.md`](CONCEPT.md) is the pitch.
- [`SOURCE.md`](SOURCE.md) has your table jobs, with full checklists.
- [`docs/KICKOFF.md`](docs/KICKOFF.md) has the paste-in prompts for the coding agents.

## Where things stand

**Done:** built and tested on the laptop, all in this repo.
- **Backend** (`backend/`, `main.py`): serves every contract route from the demo data. The deploy script (`deploy/deploy.sh`) was rehearsed on a local cluster but **hasn't been deployed to the event yet**.
- **UI** (`web/`):
  - every screen: Monitor, Shopper, Brand, Store, Price, Opt-in and the QR screen;
  - the evidence drawer, the heatmap and the shelf zone overlay;
  - print sheets for the zone stickers and the QR card, plus the pitch frames and icons;
  - built into `web/dist`.
- **Demo data** (`mock/seed.json`): 5 demo steps, with real heatmaps from NVIDIA's store scene.
- **Briefs:** `CLAUDE.md` (backend plus the fixed contract), `web/ASTRA.md`, `web/ASTRA_ASSETS.md`, `NOTES.md` (everything known about the event's stack) and `CONCEPT.md`.
- **Footage:** downloaded to the laptop at `C:\Users\yussu\VAST-footage`, with a README of sources and licences. It's for practice only.
- **The Cosmos check is written but hasn't been run** (12:16). `backend/verify.py` asks Cosmos about one clip, and `evals/labelled.py` scores the labelled set.
  - Both run on the laptop, because the event's GPU host answers from the venue Wi-Fi (NOTES.md, checked at 12:14).
  - They're only waiting on the team's keys in `nearly/.env`.

**Not done:**
- the keys
- anything that needs the build machine
- the filming at the table and the Cosmos accuracy result
- the agent and tables
- the video and the submission

## 1. Get in (first 15 minutes)

- [ ] **Cosmos Community account** at community.vastdata.com with your event email, if you don't have one.
- [ ] **Sign in at https://workshop.thecosmoslabs.com** and pick our team number. Your lab page has **Open desktop** (the build machine) and **App** (our deployed app). If no machine shows up, ask staff.
- [ ] **Cursor** signed in with the event email, so the event's credits apply.
- [ ] **tokens& login** for the submission form at tokensand.com/vastlondon (Google or an emailed code). Do it now, not at 15:45.
- [ ] **Ask staff two questions:**
  - Can we film at our table and put our own clips through the pipeline?
  - Can we use the NVIDIA SmartSpaces store scene?

  Write the answers in NOTES.md section 9.
- [ ] **Phone alarms:** 14:30 freeze, 15:45 submit.
- [ ] **Keys onto the laptop.** On the lab page, click Open desktop, open a terminal, and run
  `grep -hE '^(COSMOS3_REASON_URL|YOLO_URL|GPU_BEARER_TOKEN)=' /config/*.config`
  - Copy the three lines with Ctrl+Shift+C and paste them into `nearly/.env` on the laptop, under the comment.
  - Add `WANDB_API_KEY=` with the key from wandb.ai/authorize.
  - If `COSMOS3_REASON_URL` is missing, NOTES.md section 1 says where it lives instead.
  - Never paste these values into a chat.

## 2. On the build machine, in this order

If a step runs past its time, take its fallback (CLAUDE.md) and move on.

- [ ] **Get the code:** in the `vast-builders-challenge` folder, run
  `git clone https://github.com/Warisback/nearly.git nearly && echo "nearly/" >> .git/info/exclude`
- [ ] **NOTES.md section 0:**
  - git pull, `/config`, the env variable names (never the values)
  - model health, one real Cosmos call and one YOLO call
  - VSS health
  - what footage is indexed (check for the London walking footage)
  - the cluster

  Mark each line [LIVE] once it's been run.
- [ ] **Deploy:** run `bash deploy/deploy.sh` from `nearly/`. Then go to the lab page, click App, and note the URL (`https://team-<N>-app.thecosmoslabs.com/app/`).
  - That's the URL you submit.
  - Put it into `APP_URL` in `web/public/print/optin-card.html` and reprint the QR card.
- [ ] **Step 2, the risky part:** the code is written, so this step is now filming and running it.
  - Film the labelled clips, then run `python -m backend.verify clips/labelled/clip_01.mp4` once to see a real answer.
  - Then run `evals/labelled.py` over the whole set. Its first lines say how.
  - The gate is 7 of 10 right.
- [ ] **Step 3, the live path:** build the direct drop folder first, because uploads stalled at SF and NYC.
- [ ] **Step 4:** `planogram.json` with the sticker map (1→B2-A, 2→B2-B, 3→B2-C, 4→B1-A, 5→B1-B, 6→B1-C). Line the zones up with the UI's `Z` editor.
- [ ] **Step 5:**
  - the tables: VastDB, or `data/*.json` if writes are refused;
  - `agent.py`, using W&B Inference (Llama 3.3 70B) traced in Weave.
- [ ] **Step 6:** the Weave eval. Put its numbers into CONCEPT.md's "How accurate is it?" answer.
- [ ] **Step 7:** final deploy, then run the whole demo once on the App URL. **Freeze at 14:30.**

## 3. At the table (SOURCE.md jobs 1–3)

- [ ] **Job 1:** make the heatmap readable on the projector.
- [ ] **Job 2, the set-up:**
  - 6 real products and the stickers 1–6 (print `zone-stickers.html`, or use a thick marker);
  - a phone about 2 m above the shelf, and the QR card.
  - Then film:
    - the 4 clips the Monitor screen needs;
    - the labelled set: 10 takes, 10 put-backs and 3 no-action clips, logged in `clips/labelled/labels.csv`;
    - the gap shots: 5 reaches into an empty slot, products swapped round, one browse between products.
- [ ] **Job 3, clean the demo data:**
  - real product names and prices, and ping text that matches;
  - no raw IDs like "B2-A" anywhere a judge can read;
  - fix the evidence title that says "7 put-backs" while the Brand screen shows 6.
  - Keep `web/public/mock/seed.json` identical to `mock/seed.json`.

## 4. Pitch and submit

- [ ] Get **one quote from someone in retail media** and put it in CONCEPT.md.
- [ ] **Rehearse twice from CONCEPT.md's demo beats.** Record one and watch it. Do the failure drill: switch off the live path mid-demo and carry on with **G**.
- [ ] **Video:**
  - screen-record one clip per beat and record the voiceover separately;
  - 90–120 seconds, watched once on a phone;
  - the frames are in `web/public/pitch/`.
- [ ] **Submit by 15:45** at tokensand.com/vastlondon:
  - the repo link (github.com/Warisback/nearly, already public)
  - the video link
  - what you built and the tools used (CONCEPT.md's one line, plus the README's "Built with")
  - team names and contact emails
- [ ] **Demos from 16:30**, closing and awards at 18:30.

## 5. Keep in mind

- **Never paste keys or tokens into a chat, and never commit them.** `.env` is ignored by git. There's an empty template at `nearly/.env` on the original laptop.
- **Nothing from `VAST-footage` goes into the pipeline** (the event bans internet video) unless staff say yes.
- **Never call per-camera detection "tracking".** Show "can't tell" honestly.
- **The contract is fixed.** Change `CLAUDE.md`, `web/ASTRA.md` and the wireframe together, or not at all.
- **Push to GitHub as you go.** The folder above `nearly/` on the laptop has old copies of the briefs, so ignore those.

## 6. After the event

- [ ] Take screenshots at the freeze, while the demo state is clean.
- [ ] Polish the README for recruiters, with the video in it.
- [ ] A short debrief: what worked and what cost time.
