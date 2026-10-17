# Nearly

The till only sees what's in the basket. A shelf camera sees what people pick up and put back.

Nearly turns one shelf camera into a stream of checked events (take, put back, touch, can't tell) that three people see differently:
- **An opted-in shopper** gets a "nearly bought" list and a price-drop ping.
- **A brand** gets totals for its own products only, hidden below 5 shoppers.
- **The store** gets heatmaps and a price for its shelf space.

Built at the **VAST Builders Challenge, London, 17 October 2026**. This is a work in progress during the event.

## How it works

1. A phone above the shelf records a short clip, which is uploaded through VAST's pipeline. There's also a direct path for when the trigger is down.
2. **NVIDIA Cosmos Reason** watches the clip and answers one closed question: take, put back, touch, none, or can't tell. Numbered stickers under the products tell it which zone the hand went into.
3. The checked event is saved, along with its clip, confidence and latency. A shopper who scanned the QR card at the entrance has it linked to their visit. Nobody else is identified, and there's no face recognition.
4. **W&B Inference** writes the price-drop ping and the evidence summaries, and every call is traced in **Weave**.
5. One set of events is served three ways (`api/shopper`, `api/brand`, `api/store`). The demo ends on what one end-cap is worth per week as in-store media.

The contract (data shapes and routes) is in [`CLAUDE.md`](CLAUDE.md) and [`web/ASTRA.md`](web/ASTRA.md), and the two must match.

## Run it locally

```bash
pip install -r requirements.txt
python main.py                 # http://127.0.0.1:8000/  (serves web/dist and the API)
```

To work on the UI against the mock data:

```bash
cd web && npm install && npm run dev
# open http://127.0.0.1:5173/?mock=1#/monitor   (L next step, G hero moment, R reset)
```

On the event's build machine, deploy to `/app` with `bash deploy/deploy.sh` from this folder. [`NOTES.md`](NOTES.md) section 4 explains how.

## What's where

| Path | What it is |
|---|---|
| `CLAUDE.md` | Backend brief and the contract |
| `web/ASTRA.md`, `web/ASTRA_ASSETS.md` | UI brief and the assets brief |
| `NOTES.md` | What we learned about the event's stack: request shapes, auth, deploy, VastDB |
| `SOURCE.md` | Teammate guide: repo map and today's jobs |
| `backend/` | FastAPI app serving the contract routes |
| `web/` | React + Vite UI, print assets (zone stickers, QR card) and pitch frames |
| `mock/seed.json` | Every API response for each demo step, plus the store heatmaps |
| `deploy/` | Deploy and smoke-test scripts for the event cluster |
| `docs/` | Kickoff prompts and timeline, the wireframe, and data sources |

## Built with

| Sponsor | What we use |
|---|---|
| NVIDIA | Cosmos Reason (take/put check) and the PhysicalAI-SmartSpaces data |
| VAST Data | Upload and processing pipeline, VastDB, retrieval and the `/app` deploy |
| Weights & Biases | W&B Inference (Llama 3.3 70B) and Weave traces and evals |
| CoreWeave | GPUs behind the models |

## Data and credits

- Store heatmaps are computed from NVIDIA's ground truth for scene 071: 31 people over 13.3 minutes, sampled once per second. Footage: NVIDIA Physical AI Smart Spaces dataset (https://huggingface.co/datasets/nvidia/PhysicalAI-SmartSpaces), licensed under CC BY 4.0. See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).
- No video is stored in this repo. Clips of people stay on our machines.
- Product names in the mock data are placeholders for the products on our demo shelf.
