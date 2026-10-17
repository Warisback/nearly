#!/usr/bin/env bash
# Deploy Nearly to our team's cluster at /app, following
# .cursor/skills/deployment/deploy-app-no-registry with four changes (NOTES.md section 4):
#   1. the code ConfigMap goes in with server-side apply (client-side apply caps it at 256 KB);
#   2. the readiness probe reads GET /api/products (the contract has no /health route);
#   3. a code-hash annotation restarts the pod only when the code changed;
#   4. clips/*.mp4 are copied into the running pod (video doesn't fit in a ConfigMap).
#
# Run on the VM, from the nearly/ folder:   bash deploy/deploy.sh
# DRY_RUN=1 prints the manifests instead of applying them. TEAM_CONFIG=path overrides /config,
# APP_HOST=... overrides the Ingress host (default video-lab-team-<N>.cosmos.vastdata.com).
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="${APP_NAME:-nearly}"
APP_PORT=8080

# Team config, parsed the way the skills do it (sourcing it breaks on zsh: USERNAME is reserved).
if [ -z "${TEAM_CONFIG:-}" ]; then
  mapfile -t TEAM_CONFIGS < <(find /config -maxdepth 1 -type f -name '*.config' 2>/dev/null | sort)
  (( ${#TEAM_CONFIGS[@]} == 1 )) || { echo "expected exactly one /config/*.config, found ${#TEAM_CONFIGS[@]}"; exit 1; }
  TEAM_CONFIG="${TEAM_CONFIGS[0]}"
fi
cfg() { grep -m1 "^$1=" "$TEAM_CONFIG" | cut -d= -f2- || true; }
USERNAME="$(cfg USERNAME)"; INGRESS_URL="$(cfg INGRESS_URL)"; PASSWORD="$(cfg PASSWORD)"
[ -n "$USERNAME" ] || { echo "USERNAME is missing from $TEAM_CONFIG"; exit 1; }
NS="${NS:-$USERNAME}"
if [ -z "${KUBECONFIG:-}" ]; then
  for k in "/config/${NS}-k8s.yaml" /config/kubeconfig; do
    if [ -f "$k" ]; then export KUBECONFIG="$k"; break; fi
  done
fi
APP_HOST="${APP_HOST:-video-lab-team-${USERNAME#team-}.cosmos.vastdata.com}"
K=(kubectl -n "$NS")

manifest() {
cat <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${APP_NAME}
  labels:
    app: ${APP_NAME}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${APP_NAME}
  template:
    metadata:
      labels:
        app: ${APP_NAME}
      annotations:
        nearly/code-hash: "${CODE_HASH}"
        nearly/vss-url: "${VSS_URL}"
    spec:
      containers:
      - name: app
        image: python:3.12-slim
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: ${APP_PORT}
        env:
        - name: PORT
          value: "${APP_PORT}"
        - name: VSS_URL
          valueFrom:
            secretKeyRef:
              name: ${APP_NAME}-vss-creds
              key: VSS_URL
        - name: VSS_USERNAME
          valueFrom:
            secretKeyRef:
              name: ${APP_NAME}-vss-creds
              key: VSS_USERNAME
        - name: VSS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: ${APP_NAME}-vss-creds
              key: VSS_PASSWORD
        volumeMounts:
        - name: code
          mountPath: /code
        workingDir: /code
        command: ["bash", "-c"]
        args:
        - |
          set -euo pipefail
          if [ -f requirements.txt ]; then
            pip install --no-cache-dir -q --disable-pip-version-check --root-user-action=ignore -r requirements.txt
          fi
          exec python main.py
        readinessProbe:
          httpGet:
            path: /api/products
            port: ${APP_PORT}
          initialDelaySeconds: 10
          periodSeconds: 10
      volumes:
      - name: code
        configMap:
          name: ${APP_NAME}-code
---
apiVersion: v1
kind: Service
metadata:
  name: ${APP_NAME}
  labels:
    app: ${APP_NAME}
spec:
  selector:
    app: ${APP_NAME}
  ports:
  - name: http
    port: 80
    targetPort: ${APP_PORT}
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${APP_NAME}
  labels:
    app: ${APP_NAME}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /\$2
spec:
  ingressClassName: nginx
  rules:
  - host: ${APP_HOST}
    http:
      paths:
      - path: /app(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: ${APP_NAME}
            port:
              number: 80
EOF
}

echo "== 1/6 package" >&2
python3 deploy/package.py >&2
CODE_HASH="$(cat deploy/build/code-hash)"
VSS_URL="$INGRESS_URL"

if [ "${DRY_RUN:-}" = "1" ]; then
  manifest
  echo "# DRY_RUN=1: namespace $NS, host $APP_HOST, nothing applied" >&2
  exit 0
fi

if ! command -v kubectl >/dev/null; then
  echo "kubectl isn't installed on this VM (it wasn't at SF either). Install it, then re-run:"
  echo "  mkdir -p ~/.local/bin && curl -sLo ~/.local/bin/kubectl https://dl.k8s.io/release/v1.31.4/bin/linux/amd64/kubectl && chmod +x ~/.local/bin/kubectl && export PATH=~/.local/bin:\$PATH"
  exit 1
fi
# Check access inside our namespace: `kubectl cluster-info` reads kube-system, which a team kubeconfig may not allow.
"${K[@]}" get deploy,svc,ingress >/dev/null || { echo "kubectl can't use namespace $NS (KUBECONFIG=${KUBECONFIG:-unset})"; exit 1; }

# Inside pods the team ingress host didn't resolve at SF or NYC; the in-namespace VSS backend Service did.
if "${K[@]}" get svc video-backend-service >/dev/null 2>&1; then
  VSS_URL="http://video-backend-service:8000"
fi

# Only one Ingress may own /app on our host. One line per (ingress, host, path).
OTHERS="$("${K[@]}" get ingress -o go-template='{{range .items}}{{$n := .metadata.name}}{{range .spec.rules}}{{$h := .host}}{{if .http}}{{range .http.paths}}{{$n}} {{$h}} {{.path}}{{"\n"}}{{end}}{{end}}{{end}}{{end}}' \
  | awk -v me="$APP_NAME" -v host="$APP_HOST" '$1 != me && $2 == host && ($3 == "/app" || index($3, "/app/") == 1 || index($3, "/app(") == 1) {print $1}' | sort -u | tr '\n' ' ')"
if [ -n "$OTHERS" ]; then
  echo "Another Ingress already serves /app on $APP_HOST: $OTHERS"
  echo "Remove it first:  ${K[*]} delete ingress $OTHERS"
  exit 1
fi

echo "== 2/6 code ConfigMap (server-side apply)"
"${K[@]}" create configmap "${APP_NAME}-code" --from-file=deploy/build/configmap --dry-run=client -o yaml \
  | "${K[@]}" apply --server-side --force-conflicts -f -

echo "== 3/6 VSS credentials Secret (VSS_URL=$VSS_URL)"
"${K[@]}" create secret generic "${APP_NAME}-vss-creds" \
  --from-literal=VSS_URL="$VSS_URL" \
  --from-literal=VSS_USERNAME="$USERNAME" \
  --from-literal=VSS_PASSWORD="$PASSWORD" \
  --dry-run=client -o yaml | "${K[@]}" apply -f -

echo "== 4/6 Deployment, Service, Ingress (code hash $CODE_HASH)"
manifest | "${K[@]}" apply -f -

echo "== 5/6 rollout"
"${K[@]}" rollout status deploy/"$APP_NAME" --timeout=240s

echo "== 6/6 clips and smoke test"
# A Ready pod that isn't terminating (after a revert, the newest pod can be the one going away).
POD="$("${K[@]}" get pods -l app="$APP_NAME" -o go-template='{{range .items}}{{$p := .}}{{if not .metadata.deletionTimestamp}}{{range .status.conditions}}{{if and (eq .type "Ready") (eq .status "True")}}{{$p.metadata.name}}{{"\n"}}{{end}}{{end}}{{end}}{{end}}' | head -n1)"
[ -n "$POD" ] || { echo "no ready $APP_NAME pod: ${K[*]} get pods -l app=$APP_NAME"; exit 1; }
shopt -s nullglob
CLIPS=(clips/*.mp4)
for clip in "${CLIPS[@]}"; do
  "${K[@]}" cp "$clip" "$POD:/tmp/nearly/clips/$(basename "$clip")" -c app
done
echo "copied ${#CLIPS[@]} clip(s) into $POD"

# The ingress controller takes a few seconds to route a new Ingress or endpoint.
for _ in $(seq 1 20); do
  [ "$(curl -s --connect-timeout 3 --max-time 5 -o /dev/null -w '%{http_code}' "http://${APP_HOST}/app/api/products" || true)" = "200" ] && break
  sleep 3
done
if ! python3 deploy/smoke.py "http://${APP_HOST}/app/" --readonly; then
  echo "The check through the Ingress failed. Checking the pod directly, to tell an app problem from a routing one:"
  "${K[@]}" port-forward deploy/"$APP_NAME" 18080:"$APP_PORT" >/dev/null 2>&1 &
  PF=$!
  sleep 3
  python3 deploy/smoke.py http://127.0.0.1:18080/ --readonly || true
  kill "$PF" 2>/dev/null || true
  exit 1
fi

echo
echo "Deployed. In-cluster URL: http://${APP_HOST}/app/"
echo "For people: https://workshop.thecosmoslabs.com > lab page > App. At SF and NYC that opened"
echo "https://team-${USERNAME#team-}-app.thecosmoslabs.com/app/ (check by clicking App; that's the URL to submit)."
echo "The UI talks to this backend by default; add ?mock=1 to read the seed instead (?mock=1&frame=3 for video takes)."
