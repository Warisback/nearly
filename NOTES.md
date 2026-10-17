# Nearly: backend notes

**Status, 10:20 Sat 17 Oct.** Everything below was put together on the laptop. Nothing has been run against our team's endpoints yet, because the laptop has no `/config`, no kubeconfig and no model URLs. Sources:
- the event's skills on GitHub
- earlier cities' public repos [FIELD]
- a full rehearsal of the step-1 deploy on a local Kubernetes cluster [K3S]

The first job on the VM is the checklist in section 0, then `bash deploy/deploy.sh` (section 4). Mark each line [LIVE] once it has been run.

Tags:
- **[DOC]** written in the event's skills
- **[LIVE]** checked on our VM
- **[K3S]** rehearsed on the laptop: k3s v1.31, real ingress-nginx v1.11.3, a fake VSS owning `/` and `/api` on the same host, and headless Edge
- **[FIELD]** seen in an earlier city's public repo
- **[OURS]** our decision

Source for every [DOC] line: `vast-data/vast-builders-challenge` at `a770d20` (Fri 16 Oct, 16:17 BST). On the VM, run `git pull && git log -1 --format='%h %ci'`. If HEAD isn't `a770d20`, run `git diff a770d20 -- .cursor README.md config.example` and re-read whatever changed.

---

## 0. Checklist for 09:30 on the VM (in this order)

Run from the repo root on the VM. List variable **names** only and never print values (the event rule says the same).

```bash
git pull && git log -1 --format='%h %ci'
ls /config                                   # expect one <team>.config, <team>-k8s.yaml
env | cut -d= -f1 | sort | grep -E 'COSMOS|YOLO|EMBED|CANARY|WANDB|S3_|VDB|VASTDB|INGRESS|USERNAME|PIPELINE|GPU_BEARER'
which ffmpeg kubectl python3; python3 --version
```

1. **Model health** (paths differ per model; a 404 on an unlisted path is normal):
   ```bash
   H=(); [ -n "${GPU_BEARER_TOKEN:-}" ] && H=(-H "Authorization: Bearer $GPU_BEARER_TOKEN")
   for p in /v1/models /v1/health/ready /v1/health/live; do curl -s -o /dev/null -w "cosmos $p %{http_code}\n" "${H[@]}" "$COSMOS3_REASON_URL$p"; done
   curl -s "${H[@]}" "$YOLO_URL/healthz"              # expect ok:true, model_loaded:true
   curl -s "${H[@]}" "$YOLO_URL/openapi.json" > /tmp/yolo_openapi.json   # paste the /v1/infer schema into section 2
   curl -s "${H[@]}" "$COSMOS3_REASON_URL/v1/models"  # note data[0].id
   ```
2. **One real Cosmos call** on a 5 s clip of a hand at a shelf, plus one clip with no action. Paste the raw `content` string and the seconds into section 1. (`nearly/backend/verify.py` is step 2. Use the curl in section 1 for this check.)
3. **One real YOLO call** on the same clip. Paste the top-level keys and one `frames[0]` item into section 2.
4. **VSS health:** login, then dashboard (`retrieval/login`, `retrieval/dashboard`), or ask Cursor "check that everything is working".
5. **What's indexed:** `GET /api/v1/dashboard/stats?scope=all` → `metadata.location`, `metadata.camera_id`, `recent_videos[].filename`. Fill in section 8.
6. **Cluster:** `export KUBECONFIG=/config/${USERNAME}-k8s.yaml; kubectl cluster-info; kubectl -n $USERNAME get pods,ingress`.
7. **Pod reachability** (needed for steps 3 and 5). After the first deploy, from inside our pod:
   `kubectl -n $USERNAME exec deploy/nearly -- python -c "import urllib.request as u;print(u.urlopen('$YOLO_URL/healthz',timeout=5).status)"`, and the same for `$COSMOS3_REASON_URL/v1/models`, `$S3_ENDPOINT` and `https://api.inference.wandb.ai/v1/models`.

---

## 1. Cosmos3-Reason: `$COSMOS3_REASON_URL`

**Request [DOC]:** OpenAI-style chat completions, with the clip sent inline as a base64 data URI.

```bash
MODEL=$(curl -s "${H[@]}" "$COSMOS3_REASON_URL/v1/models" | python3 -c "import sys,json;print(json.load(sys.stdin)['data'][0]['id'])")   # known: nvidia/cosmos3-reason
python3 - "$MODEL" clip.mp4 > /tmp/req.json <<'EOF'
import base64, json, sys
model, clip = sys.argv[1], sys.argv[2]
prompt = "Describe what the hand does in this clip in one sentence."   # step 2 swaps in the exact prompt from CLAUDE.md
b64 = base64.b64encode(open(clip, "rb").read()).decode()
print(json.dumps({"model": model, "temperature": 0, "max_tokens": 256,
  "messages": [{"role": "user", "content": [
     {"type": "text", "text": prompt},
     {"type": "video_url", "video_url": {"url": "data:video/mp4;base64," + b64}}]}]}))
EOF
time curl -s -X POST "$COSMOS3_REASON_URL/v1/chat/completions" "${H[@]}" -H "Content-Type: application/json" -d @/tmp/req.json | python3 -m json.tool
```

- **Gotcha [OURS]:** the skills inline the base64 clip in the command (`-d "{\"video_base64\":\"$B64\"…}"`). Linux limits one argument to 128 KB, so that fails for any clip over about 96 KB. Always write the JSON to a file and send it with `-d @file`, as above.

- **Model id: never hardcode it.** Read `GET /v1/models` → `data[0].id`.
  - [DOC] `config.example` lists `nvidia/cosmos3-reason` as known-good.
  - [FIELD] At SF and NYC the endpoint served **`nvidia/cosmos3-nano-reasoner`**, and sending `nvidia/cosmos3-reason` returned **404** "model does not exist".
  - If you get a 404, re-read `/v1/models`.
- **Request [FIELD]:** every team that verified a video call sent only `model`, `messages`, `temperature` (0 or 0.2) and `max_tokens`.
  - The NIM's own defaults are temperature 0.7 and top_p 0.8, so always set `temperature: 0` and `max_tokens` yourself.
  - Only base64 `data:video/mp4` URIs were verified. No team got http(s) video URLs working.
  - Text-first and video-first content both worked; NVIDIA's guide says put the media first.
  - `response_format: {type: json_schema, …}` (guided decoding) worked for one NYC finalist team. It rejects `uniqueItems`, and arrays need `maxItems`. Worth trying in step 2 with an `enum` on `action`.
- **Response [DOC + FIELD]:** `choices[0].message.content` is plain text.
  - **No `<think>` unless the prompt asks for it** (0 in 543 saved replies). `reasoning_content` was empty.
  - **79 of 127 JSON replies came wrapped in ```json fences**, even though the prompt said "no markdown".
  - Ask for **one flat object**: JSON-array prompts looped until `max_tokens` and got cut off.
- **Parse rule [OURS], for step 2:**
  1. Strip any `<think>…</think>` block.
  2. If there's an `<answer>…</answer>` block, use its contents.
  3. Strip any ``` fences, take the first balanced `{…}` and run `json.loads`.
  4. On any failure → `cant_tell`. If `confidence < 0.6` → `cant_tell`. `action: "none"` → no event.
- **Latency [FIELD]:**
  - **A single short clip takes 1.4 to 3.6 s.**
  - With 4 parallel callers: p50 5.8 s, p90 11.3 s, max 25.7 s.
  - Short-lived **502 and 429 errors** happen under load.
  - **Do [OURS]:** a 60 s timeout, one retry after 2 s on 502, 429 or a timeout, and one call at a time in the live demo. Log the seconds for every call.
- **Clip prep [FIELD + OURS]:**
  - **What worked:** cutting to 2 s and 960 px wide gave 5× fewer prompt tokens and about 40% lower latency than a 5 s 1080p clip (SF): `ffmpeg -i in.mp4 -ss <start> -t 2.5 -vf "crop=<shelf box>,scale=960:-2" -an -c:v libx264 -pix_fmt yuv420p -crf 30 out.mp4`.
  - **Brief actions were missed** at full frame unless the clip was short, **cropped to the region** or slowed down (a 0.3 s kick was found only at 0.8 s and 12 fps).
  - **So:** crop to the shelf, and keep 2 to 3 s around the reach.
  - If the VM has no ffmpeg, `pip install imageio-ffmpeg` ships one.
- **Accuracy warnings for the 11:00 gate [FIELD]:**
  - The **nano model read hand and cup states right only 49% of the time** (Gemini Flash: 92%).
  - A leading yes/no question got "yes" on 168 of 180 clips. Long structured prompts under-reported real events.
  - It **echoes words from the prompt** back as observations.
  - Temperature 0 was **not fully deterministic**.
  - **What helped:** neutral label definitions (ours has them); an explicit default ("choose none unless you clearly see…"); an unclear option (ours: `cant_tell`); random no-action control clips; and a majority of 2 calls when it matters.
- **Auth: the docs disagree.**
  - [DOC] `config.example` and `ARCHITECTURE_REFERENCE.md` say "No auth token is needed". The older `gpu/` skills send `Authorization: Bearer $GPU_BEARER_TOKEN`.
  - [FIELD] At SF and NYC, **Cosmos returned 401 without the Bearer token**.
  - **Do:** send the header whenever `GPU_BEARER_TOKEN` is set, and probe `/v1/models` both ways at 09:30.
- **Host: the docs disagree.**
  - [DOC] The `gpu/` skills hardcode `GPU_HOST=166.19.38.112`, ports 8001 to 8004. `config.example` says each model's URL is set in `/config`.
  - [FIELD] At SF and NYC, `COSMOS3_REASON_URL` was **missing from /config**. Teams used `166.19.38.112:8001` without `/v1`, or read `cosmos_host`/`cosmos_port` from `/config/<team>-vss2-secret.yaml`.
  - **Do:** use the env var; if it's missing, fall back to the skills' host, read from config in one place. Accept base URLs with or without a trailing `/v1`.
- **From the laptop [LIVE, 12:14]:** the event GPU host answers from the venue Wi-Fi.
  - `166.19.38.112:8001/v1/health/ready` and `:8002/healthz` both return 401 in 0.2 s. They're reachable and want the team token.
  - So `backend/verify.py` and `evals/labelled.py` run on the laptop once `nearly/.env` (gitignored) holds `COSMOS3_REASON_URL`, `GPU_BEARER_TOKEN` and `YOLO_URL`, copied from `/config/<team>.config` on the VM.
- **From the pod [FIELD]:** at SF, a pod reached the GPU host by IP. Team hostnames didn't resolve inside the cluster, and one team needed `hostAliases`. If the London URL is a hostname, test it from the pod (section 0, step 7).

## 2. YOLO11: `$YOLO_URL` (yolo11s, Ultralytics on a custom FastAPI server)

- **Request [DOC]:** `POST $YOLO_URL/v1/infer` with JSON `{"video_base64": "<b64 of the mp4>", "filename": "clip.mp4", "include_frames": true}`. The auth header is optional, as for Cosmos.
  ```bash
  python3 -c "import base64,json,sys;print(json.dumps({'video_base64':base64.b64encode(open(sys.argv[1],'rb').read()).decode(),'filename':'clip.mp4','include_frames':True}))" clip.mp4 > /tmp/yolo.json
  time curl -s -X POST "$YOLO_URL/v1/infer" "${H[@]}" -H "Content-Type: application/json" -d @/tmp/yolo.json > /tmp/yolo_out.json
  python3 -c "import json;d=json.load(open('/tmp/yolo_out.json'));print(list(d));f=d.get('frames') or [];print(len(f));print(json.dumps(f[0] if f else None)[:800])"
  ```
- **Source code [FIELD, official]:** the server is public, in `vast-data/vss-blueprint` → `scripts/vss-blueprint-models/yolo-infer/main.py` ("VSS YOLO11 Infer" 1.1.0, unchanged since 30 Aug). Responses saved at NYC and SF match it key for key.
- **Request fields:** exactly one of `video_base64` (a `data:` prefix is fine; **no newlines**, since it's decoded with `validate=True`) or `url` (presigned http(s), ≤ 200 MiB). Optional `filename` and `include_frames`.
  - **`include_frames` defaults to false**, and then there are no boxes.
  - There's **no fps, stride, conf or classes parameter**; unknown keys are ignored.
  - **The confidence threshold is fixed at 0.4.**
  - **YOLO runs on every decoded frame**, so re-encode to 5 to 10 fps and 640 px first.
  - `POST /v1/infer-base64` is an alias.
- **Response:** `{ok, perception_ok, perception_json:{source:"yolo11_coco", frames, object_classes, object_counts, max_detection_conf, frame_count, detection_count}, object_classes, object_counts, max_detection_conf, frames}`.
  - `frame_count` and `detection_count` are only inside `perception_json`.
  - `frames` comes twice: at the top level and inside `perception_json`.
- **Each frame:** `{"frame_index": 0, "shape": [H, W], "detections": [{"label": "person", "confidence": 0.8731, "bbox": [x1, y1, x2, y2]}]}`.
  - `bbox` is **xyxy in integer pixels** of the clip you sent.
  - There's **no timestamp, fps or track id**: compute `t = frame_index / your_fps` and track yourself.
  - The foot point for zones and footfall is `((x1+x2)/2, y2)`.
- **Traps:**
  - **`object_counts` in this response is boxes summed over all frames**, not people. Use the per-frame maximum from `frames`. In VastDB rows and the sidecar it already is the per-frame maximum.
  - `perception_ok` only means at least one frame decoded; it's true with zero detections.
- **Health [DOC + FIELD]:** `GET /healthz` → `{"ok":true,"model":"/models/yolo11s.pt","device":"0","cuda_available":true,"model_loaded":true,"inputs":["url","video_base64"]}`.
  - There's no `/v1/models`. `GET /v1/infer` returning 405 means the route exists.
- **Errors [FIELD]:** 400 (bad base64), 413 (over 200 MiB), 422 (schema), 502 "Inference failed".
- **Latency [FIELD]:** 0.84 s for a 2 s clip without frames, 2.55 s for a 5 s 1080p clip with frames, an average of 1.88 s over 200 calls on 640×360 at 15 fps. Use a 120 s timeout.
- **Auth [FIELD]:** the server code has no auth, but at SF a Bearer token was required, which suggests a proxy in front. Same rule as Cosmos.
- **Shelf products:** COCO has no shelf-product classes ("bottle" at best). Product identity comes from the zone sticker and `planogram.json`, never from YOLO.
- **Already-made detections [DOC]:** for any indexed segment, `GET $INGRESS_URL/api/v1/videos/detections?source=<segment s3 uri>` (JWT) returns the pipeline's YOLO sidecar JSON. A 404 means the segment has no sidecar.

## 3. Embed1: `$COSMOS_EMBED1_URL` (we probably won't need it)

`POST /v1/embeddings` with `{"input": "<text or data:video/mp4;base64,...>", "model": "<data[0].id>", "request_type": "query", "encoding_format": "float"}` → `data[0].embedding`, 256 floats [DOC].

---

## 4. Deploy runtime: what `/deploy-app-no-registry` expects

**[DOC] facts:**

| Thing | Value |
|---|---|
| Where it runs | A Kubernetes Deployment in our namespace (`$USERNAME`, e.g. `team-17`), `KUBECONFIG=/config/${USERNAME}-k8s.yaml`. Never "run it locally" as the deliverable. |
| Image | `python:3.12-slim` (public). No Docker build or push. |
| Code | One ConfigMap made with `kubectl create configmap <app>-code --from-file=<dir>`, **~1 MiB total**, mounted **read-only** at `/code` (`workingDir`). |
| Start command | `bash -c 'set -euo pipefail; [ -f requirements.txt ] && pip install --no-cache-dir -q -r requirements.txt; exec python main.py'` |
| Port | `PORT=8080` env. The app must bind `0.0.0.0:$PORT`. |
| Readiness probe | `GET /health` on 8080, 10 s initial delay, every 10 s |
| Secret | `VSS_URL=$INGRESS_URL`, `VSS_USERNAME`, `VSS_PASSWORD` as env vars |
| Service / Ingress | Service :80 → 8080. Ingress `nginx`, host `video-lab-team-<N>.cosmos.vastdata.com`, path `/app(/\|$)(.*)`, `rewrite-target: /$2`, so **the app sees `/`**. |
| URL for humans | https://workshop.thecosmoslabs.com → lab page → **App** / "View app". Never `$INGRESS_URL`. |
| Update loop | Recreate the ConfigMap, then `kubectl rollout restart deploy/<app>`. A running pod doesn't pick up ConfigMap changes. |
| Check | `kubectl rollout status`; `curl http://$APP_HOST/app` (this is the cluster check; humans use the workshop link) |

**What that means for us [OURS]:**
- **Entry point is `nearly/main.py`.** It runs the same way locally and in the pod.
- **The ConfigMap is flat.** `--from-file=<dir>` takes top-level files only, so subfolders such as `web/dist/assets/` and `backend/` would be dropped. So `deploy/package.py` tars `backend/`, `web/dist/`, `mock/`, `data/` and `planogram.json` into one `nearly.tgz`, next to `main.py` and `requirements.txt`. At start, `main.py` unpacks it to `/tmp/nearly`. `/code` is read-only and `/tmp` is writable, so all runtime writes go under `/tmp/nearly`.
- **Keep the tarball under ~700 KB**, because binaryData is base64-encoded inside the 1 MiB limit. `package.py` refuses anything bigger. **Video clips don't fit.** `deploy.sh` copies `clips/*.mp4` into the running pod with `kubectl cp` after each rollout. They're lost when the pod restarts, so `deploy.sh` copies them again every time.
- **No `/health` route.** The contract says no new routes. Our manifest points the readiness probe at `GET /api/products` instead (a static, in-memory read).
- **Trailing slash is critical.** The Ingress maps both `/app` and `/app/` to `/`, so the server can't tell them apart. If the browser is on `…/app` (no slash), relative URLs resolve against the host root, and `api/live` becomes `/api/live`, **which is VSS's own backend on the same host.** The server therefore injects a tiny script at the top of `index.html` that moves `…/app` to `…/app/` before anything loads. The UI still uses relative paths only.
- **The pod is ephemeral.** Runtime writes (`data/*.json`, `clips/incoming/`) vanish on restart or redeploy. VastDB is where history survives (step 5).
- **pip runs at every pod start.** `requirements.txt` pins the full tested set (FastAPI 0.143.3, Starlette 1.8.0, pydantic 2.14.1, uvicorn 0.54.0). The pod must reach PyPI. If it can't, the pod crash-loops: check `kubectl logs`.
- **The skill's own ConfigMap command fails for us [K3S, measured].** Our bundle is 408 KB, which makes a 546 KB ConfigMap object. The skill's `… | kubectl apply -f -` copies the whole object into the `last-applied-configuration` annotation, and annotations are capped at 256 KB ("metadata.annotations: Too long"). `deploy.sh` uses `kubectl apply --server-side --force-conflicts` for the ConfigMap instead.

**From earlier cities' deploys [FIELD]** (about 10 SF and NYC repos with live pods):
- **Inside a pod, the team ingress host (`INGRESS_URL`) did not resolve.** Working teams used the in-namespace Service `http://video-backend-service:8000`. `deploy.sh` uses it for `VSS_URL` when it exists, and falls back to `INGRESS_URL` otherwise.
- **pip of FastAPI/uvicorn in `python:3.12-slim` worked for every live team**, in about 15 s. Pods reached the GPU endpoints, W&B, PyPI and GitHub.
- The slim image has **no ffmpeg and no libxcb**. Use `imageio-ffmpeg` and `opencv-python-headless` if the pod processes video.
- **W&B Inference sits behind Cloudflare, which rejects Python's urllib User-Agent.** Use `requests`/`openai`, or set a User-Agent.
- **SF's VMs had no `kubectl`.** `deploy.sh` prints the one-line install. The kubeconfig was `/config/team-<N>-k8s.yaml`.
- **The in-cluster host `http://video-lab-team-<N>.cosmos.vastdata.com/app` works only on the VM or venue network.**
  - The public HTTPS front is `https://team-<N>-app.thecosmoslabs.com/app/`, the URL to submit.
  - One NYC team said that link needed a sign-in. **Test it on a phone on mobile data before relying on the QR opt-in.**
- **Other teams' fixes for the `/app` slash all ran client-side** (forced trailing slash, `<base href>` or a redirect script), the same as ours. Nobody used FastAPI `root_path`; one team found it conflicts with the prefix stripping.
- **VSS's video stream endpoint answers `binary/octet-stream`.** If we ever proxy it, rewrite the type to `video/mp4`. Presigned S3 URLs don't play in browsers (self-signed certificate, internal DNS).
- **`vastdata-filesystem` PVCs failed to mount on some nodes.** Don't count on a PVC; VastDB is our persistence.
- **INGRESS_URL may differ in London:** `config.example` now shows `INGRESS_URL=<https://ingress-url>`, so derive the Ingress host from `USERNAME`, as the skill and `deploy.sh` do.

**Deploy: `bash deploy/deploy.sh` from `nearly/` on the VM.** It runs package → ConfigMap → Secret → Deployment, Service and Ingress → rollout → copy `clips/*.mp4` into the pod → read-only smoke test through the Ingress. If that test fails, it also tests the pod through a port-forward, to tell an app problem from a routing one. Results [K3S]:
- **Timing:** the first deploy took 26 s, including pip in the pod.
- **Checks passed:** the full smoke test through `/app/` (all 5 frames match the seed, POSTs included), and a clip Range request returning 206.
- **No needless restarts:** an unchanged redeploy reports "deployment unchanged" and keeps the same pod. A code change restarts it through the `nearly/code-hash` annotation.
- **Slash fix, in headless Edge:** opening `…/app?mock=0#/monitor` (no slash) redirected to `…/app/?mock=0`. Every poll went to `/app/api/*` and **none reached VSS's `/api`**.
  - The only cost: before the redirect, the browser preloads `/assets/*.js|css` once from the wrong base. That's harmless.
- **Overrides:** `APP_HOST=…` overrides the Ingress host and `DRY_RUN=1` prints the manifests.
- **Conflict check:** the script refuses to run if another Ingress already owns `/app` on our host.
- **Smoke test any time:** `python3 deploy/smoke.py http://<host>/app/` (full, ends reset to frame 0) or `--readonly`.

## 5. VastDB: read and write [DOC]

- **SDK:** `pip install vastdb pyarrow` (`pyyaml` only for reading the backend secret).
- **Connect:** `vastdb.connect(endpoint=S3_ENDPOINT, access=ACCESS_KEY, secret=SECRET_KEY, ssl_verify=False)`.
  - Use the **data VIP** (`S3_ENDPOINT`) for everything. Writes must use it.
  - The Query Engine VIP (backend secret `vdb_endpoint`) is for reads only, and optional.
  - Add `http://` if the endpoint has no scheme (that's what the skill's scripts do).
- **Our bucket:** `VASTDB_BUCKET` (`team-<N>-vss-db`). Other teams' buckets return 403, by design.
- **Create and insert:**
  ```python
  with session.transaction() as tx:
      b = tx.bucket(VASTDB_BUCKET)
      s = b.schema("nearly", fail_if_missing=False) or b.create_schema("nearly", fail_if_exists=False)
      t = s.table("shelf_events", fail_if_missing=False) or s.create_table("shelf_events", columns=pa_schema, fail_if_exists=False)
      t.insert(pa.table(rows, schema=pa_schema))
  ```
- **Read:** `t.select(columns=[...]).read_all().to_pylist()`. Never select every column on `vss-collection`: the vector columns crash the SDK.
- **Don't touch** `vss-collection` or `vss-prompts-events`. Don't name a file `select.py` (it shadows the stdlib module).
- **Ready-made scripts:** `.cursor/skills/vast-database/vastdb-write/insert.py --schema nearly --table shelf_events --json rows.json` and `vastdb-read/query.py --schema nearly --table shelf_events`. Both read `/config/*.config` themselves.
- **Our tables [OURS], schema `nearly`, every column utf8 / int64 / float64:**
  - `shelf_events`: all `ShelfEvent` fields, with `ts` as an ISO string.
  - `zone_stats`: `zone_id, hour, footfall, dwell_s, views, takes, puts, missed_reaches`.
  - `agent_runs`: `run_id, ts, model, prompt, summary, cited_event_ids`, where `cited_event_ids` is a JSON string because list columns are untested.
- **Open:** can the **pod** reach the data VIP? If not, write from the VM. If writes are refused, use `data/*.json` and say so here.

## 6. VSS APIs we may call [DOC]

Base is `$INGRESS_URL`. Auth: `POST /api/v1/auth/login {"username","password"}` → `access_token`, sent as `Authorization: Bearer`. Video playback endpoints take `?token=` instead.

- **Upload:** `POST /api/v1/videos/upload`, multipart.
  - Fields: `file`, `is_public`, `tags`, `scenario` or `custom_prompt` (≤ 800 chars), `camera_id`, `capture_type`, `location`.
  - Returns `{success, object_key, message}`. Indexing takes tens of seconds to minutes.
  - Size and extension limits come from `GET /api/v1/config` → `app.max_upload_size_mb`. Allowed `capture_type` values come from `GET /api/v1/metadata/ingest-config` (no auth).
  - **Check that `capture_type=shelf` is allowed before relying on it.**
- **Find the new row:**
  - `GET /api/v1/videos/explore?scope=mine&limit=20` (fully indexed parents only).
  - `GET /api/v1/dashboard/stats?scope=mine` → `recent_videos[]`.
  - Or VastDB `vss-collection`, filtered by `original_video`.
- **Play a segment:** `GET /api/v1/videos/stream?source=<s3 uri>&token=<jwt>`.
- **Re-ingest:** `POST /api/v1/dashboard/reingest` (small batches only; jobs can't be cancelled). Scenario presets: `surveillance, traffic, live_driving, retail, warehouse, egocentric, sports, nhl, general`.

## 7. W&B Inference and Weave

- **[DOC]:** `WANDB_API_KEY`, `WANDB_TEAM` and `WANDB_PROJECT` are in the environment (the README says "already in your environment").
- Nothing else is documented in the repo. Step 5 still has to list the models first, turn thinking off for Nemotron and use an 8 s timeout. Earlier-city usage goes here once the research lands.

## 8. What footage is indexed (London)

- **[DOC] corpus in `ARCHITECTURE_REFERENCE.md`:**
  - I-24 highway (`i24_cam-1`)
  - PIE Toronto drives (`pie_cam-3`)
  - neighbourhood street cam (`neighborhood_cam-1`)
  - SF street cams (`sf_streets_cam-1..4`, "ingesting soon")
  - SDG warehouse (`sdg_warehouse_cam-2`)
  - indoor smart spaces (`smartspace_cam-1`, ~102 clips)
- **No retail footage is listed.** `retail` exists only as a scenario preset.
- **Hint:** the `reingest-chunk` skill's example is `20260901_224739_london-luxury-walk_chunk_0000.mp4`, so London walking footage may be in our index. **Check at 09:30** (section 0, step 5).
- **The NVIDIA scene:** our heatmaps use NVIDIA PhysicalAI-SmartSpaces `scene_071` ground truth. `smartspace_cam-1` may be the same dataset. If it is, and staff agree, it's footage we can cite as already on the platform.

## 9. Where the docs disagree with our brief (decide, don't drift)

1. **Model auth:** brief and `config.example` say no token; the `gpu/` skills require one. Send it only if set (section 1).
2. **README "Recap"** says "you don't call [the models] directly, you query the vectors generated". But `config.example` exports the model URLs. The brief's numbers from earlier cities show direct calls worked. Confirm with one call at 09:30.
3. **Submission time: settled.** tokensand.com/vastlondon says "Opens 9:30 AM BST · Deadline 4:30 PM BST" (read 08:45). The README line "Submissions will start around 4:30pm" was copied unchanged from NYC's README. Our 15:45 submit, with 16:30 as the hard stop, stands.
4. **Deploy:** the brief says no new routes; the skill's probe wants `/health`. We changed the probe, not the contract (section 4).
5. **Upload path:** `ARCHITECTURE_REFERENCE.md` says "You don't upload new chunks … for this challenge". The `upload-video` skill exists and the brief's step 3 uses it. Ask staff whether uploads of our own table footage are allowed. That's the KICKOFF question anyway.

## 10. Seed server (step 1): what it does [OURS]

Live mode behaves exactly like the UI's mock mode (`web/src/api.js`), so a presenter sees the same thing either way.

- **Frame pointer:** reads `mock/seed.json` once at boot and starts at frame 0.
  - `api/demo/step` moves forward one frame and stops at the last frame; it never wraps.
  - `api/demo/hero` jumps to `hero_frame` (3).
  - `api/demo/reset` goes to 0 and clears opt-ins.
- **Opt-in:** `POST api/optin` remembers the shopper and returns the seed's `track_id` (3 for `demo_07`). A shopper the seed doesn't know gets the next free track id.
  - **It doesn't move the frame.** `api/shopper` shows that shopper as `opted_in: true` with the track id on any frame.
- **Price:** `api/price` computes `gbp_week = views_week × cpm / 1000` and `gbp_year_store = gbp_week × endcaps (40) × 52` from the static entry, rounded to pence and to whole pounds.
  - At cpm=8 that's exactly the seed: £147.20 and £306,176.
  - `cpm` must be ≥ 0.
  - An unknown zone gets 404 "There is no price for this shelf yet."
- **Evidence:** `api/evidence` always answers 200.
  - **Seed entry exists:** returns it, with events limited to that zone's brand and `agent_run` dropped if it cites a removed event.
  - **Event in the current frame:** returns "Put back · Walkers Salt & Vinegar 32g", the event, and `agent_run: null`.
  - **Hidden zone, or a total with no seed evidence:** returns "Source clips are not included for this total yet.", because a few sample events can't stand in for an aggregate.
- **Contract rules enforced on every response:**
  - `shopper_id` is null outside `api/shopper`.
  - Hidden zones (shoppers < 5) carry zero counts.
  - `api/live` holds at most 20 events, newest first.
- **Unknown ids:** an unknown `shopper_id` gets "not opted in". An unknown `brand_id` gets `zones: []`. Bad input gets 422 JSON.
- **Serving:** `clips/` (with Range support) and `web/dist/` are served as static files.
  - `index.html` is served with the slash-fix script injected.
  - If `web/dist` isn't built yet, `/` shows a one-line placeholder page.
- **Not served:** `/docs` and `/openapi.json` are switched off, so the only routes are the contract's.
- **Run it locally:** `pip install -r requirements.txt && python main.py` → http://127.0.0.1:8000/?mock=0#/monitor

## 12. The event itself

- **Rules (tokensand.com/vastlondon, read 08:45):**
  - "Opens 9:30 AM BST · Deadline 4:30 PM BST".
  - "**Build your project during the event.**"
  - "One idea, working by the end of the day."
  - "Adapt your idea to the footage available on build day."
- **Submit:**
  - "A GitHub repository reviewers can access"
  - "A short demo video with a shareable link"
  - "What you built and the tools you used"
  - "Your team's names and contact emails"
  - The form needs a tokens& login (Google or an emailed code), so **make that login before 15:45**.
- **Agenda:** 16:30 submission deadline and demos. 18:30 closing and awards.
- **Judging:** a first round at each team's table ("walk through what you built"). The criteria are creativity, technical implementation and real-world impact.
- **Prizes:** 1st NVIDIA DGX Spark, 2nd Hugging Face Microduck. Two overall winners, no tracks.
- **Judges (Luma):**
  - Abubakr Karali, Senior Solutions Architect, NVIDIA. Note: the brief calls him a CV researcher.
  - Ram B., VAST
  - Brian Verkley, VAST
  - Junaid Butt, W&B
- **The URL to submit [FIELD]:** at SF and NYC, 35 of 86 entries linked the lab page's App URL, `https://team-<N>-app.thecosmoslabs.com/app/`. Check it by clicking App after the first deploy. `video-lab-team-<N>.cosmos.vastdata.com` is the in-cluster host; don't submit it.
- **Own footage is welcome; internet video isn't** (VAST's announcement; README).
- **Uploads and re-ingest were unreliable [FIELD]:** at SF and NYC, uploads stalled 40+ minutes or never indexed. Keep the direct path (step 3) as the main route, not a backup.

## 11. For the UI side (we don't touch `web/`)

1. **Fixed (10:25, when I took over the UI):** the UI now calls the backend by default, as ASTRA.md says. `?mock=1` reads the seed, and `?mock=1&frame=3` opens the seed on a given frame, for screenshots and video takes.
2. **Product photos (`public/products/<product_id>.jpg`, per ASTRA_ASSETS.md) must be small.**
   - The whole deploy bundle has to stay under 700 KB; it's 408 KB today. One raw phone photo is 2 to 5 MB.
   - Resize to 400 px wide, about 30 KB each: `ffmpeg -i in.jpg -vf scale=400:-2 -q:v 6 out.jpg`. `package.py` refuses an oversized bundle and lists the biggest files.
3. **Seed inconsistency, in mock and live alike:** `evidence["B2-A:puts"]` says "7 put-backs this week" and cites `ev_0141`, even on frames 0 to 2, where the Brand screen shows 6. Either fix the seed (both agents, same file) or don't click that number before the hero frame.
