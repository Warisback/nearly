# Start building

**Drag three files onto the build machine, then paste prompt 1 into the backend agent and prompt 2 into the UI agent. Set three alarms first.**

## Before 09:30 (10 minutes)

1. **Phone alarms:**
   - 11:00 Cosmos gate
   - 14:30 feature freeze
   - 15:45 submit
2. **Say out loud who owns what:**
   - **You:** the Cosmos check, the upload path, the tracker and the tables (the risky parts).
   - **Teammate:** the UI agent, filming at the table, the pitch, the demo video and the retail-media quote.
3. **Ask staff:**
   - Can we film at our table and upload our own clips?
   - Can we use the NVIDIA store scene (CC BY)?
4. **Get the repo onto the build machine.** In Cursor (Remote-SSH to `bc-<username>`), open a terminal in the `vast-builders-challenge` folder and run:

   ```bash
   git clone https://github.com/Warisback/nearly.git nearly && echo "nearly/" >> .git/info/exclude
   ```

   That puts every brief where the prompts expect it: `nearly/CLAUDE.md`, `nearly/web/ASTRA.md`, `nearly/web/ASTRA_ASSETS.md` and `nearly/mock/seed.json`. The exclude line keeps the starter repo from seeing our folder.

## Prompt 1 · backend (Cursor agent on the build machine, model set to Auto)

```
Read nearly/CLAUDE.md in full. It's the brief for today, and its CONTRACT block is fixed. Start at Build order step 0: run git pull, /build-day-quickstart and the health check, read the skills it lists, and write nearly/NOTES.md. Don't write app code until NOTES.md says how to call $COSMOS3_REASON_URL and $YOLO_URL and what runtime /deploy-app-no-registry expects. Then do step 1 (seed server and first deploy to /app) and give me the URL. Stop after each step with a two-line status: what works, what's next.
```

## Prompt 2 · UI (Astra, or a second Cursor chat)

```
Read nearly/web/ASTRA.md in full. It's the brief for today, and its CONTRACT block is fixed. Build the six screens and the evidence drawer in nearly/web against mock/seed.json with USE_MOCK on. Do Monitor and Shopper first (they carry the hero moment), then Price, Brand, Store and Opt-in. The visual layer is yours, built as tokens. Make L, G and R step through the seed frames, and check the hero (press G) looks right on Shopper and Monitor. Build to nearly/web/dist each time a screen works.
```

## Prompt 2b · assets (Astra, straight after prompt 2 or in its own chat)

```
Read nearly/web/ASTRA.md, then nearly/web/ASTRA_ASSETS.md. Build the assets in ASTRA_ASSETS.md in the order listed, one at a time, and tell me when each is done so I can check it. Start with the zone stickers: I need to print them before 10:00. Use the data already in mock/seed.json. Don't change the contract and don't touch anything outside nearly/web.
```

The stickers come first because Cosmos reads them in the 10:00 filming. If there's no printer, write 1–6 by hand in thick marker instead.

## Prompt 3 · the risky part (you drive it, 10:05)

```
Step 2 now. Write nearly/backend/verify.py: given a clip path, call $COSMOS3_REASON_URL with the exact prompt in CLAUDE.md, using the request shape in NOTES.md. Parse the JSON reply, map confidence below 0.6 or a reply that doesn't parse to cant_tell, and time each call. Add a script that runs it over every clip in nearly/clips/labelled/ against nearly/clips/labelled/labels.csv (columns: file,action,zone) and prints a confusion matrix and seconds per clip. Nothing else.
```

## Timeline (the alarms are in bold)

| Time | What |
|---|---|
| 09:30 | Build starts. Backend agent on step 0; UI agent starts on the mock data |
| 09:45 | Seed server deployed to `/app` |
| 10:00 | Teammate films 10 takes, 10 put-backs and 3 no-action clips at the table, filling in `labels.csv` as they go |
| **11:00** | **Gate: Cosmos gets 7 of 10 or more right, or the demo switches to scripted frames with live Cosmos shown** |
| 11:45 | Live path works: drop a clip, the event is saved, latency shown |
| 12:30 | Zones and opt-in |
| 13:30 | Tables, agent, lineage |
| 14:15 | Eval numbers go into the pitch's killer-question answers |
| **14:30** | **Feature freeze.** Bugs and rehearsal only from here |
| 14:30–15:45 | Two full run-throughs, one recorded and watched. Screen-record the demo and record the voiceover separately |
| **15:45** | **Submit** at tokensand.com/vastlondon: public repo, video, description, tools used |
| 16:30 | Deadline |

The footage in `C:\Users\yussu\VAST-footage` stays on the laptop for practising the tracker and heatmap code, unless staff say it can go on the build machine.
