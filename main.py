"""Start Nearly with `python main.py`, locally or in the pod.

In the pod (deploy-app-no-registry), /code is a read-only ConfigMap holding this file,
requirements.txt and nearly.tgz. The bundle is unpacked to /tmp/nearly, which is writable,
and served from there. Locally there is no bundle, so the app runs from this folder.

Env: PORT (8080 in the pod, 8000 here), HOST (0.0.0.0 in the pod, 127.0.0.1 here), NEARLY_HOME (/tmp/nearly),
NEARLY_ACCESS_LOG=1 to log every request (off by default: the UI polls every 2 s).
"""

import os
import sys
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUNDLE = HERE / "nearly.tgz"

if BUNDLE.is_file():
    root = Path(os.environ.get("NEARLY_HOME", "/tmp/nearly"))
    root.mkdir(parents=True, exist_ok=True)
    with tarfile.open(BUNDLE) as tar:
        tar.extractall(root, filter="data")
    print(f"unpacked {BUNDLE.name} to {root}", flush=True)
else:
    root = HERE

os.environ["NEARLY_ROOT"] = str(root)
sys.path.insert(0, str(root))

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app:app",
        # The pod must listen on all interfaces; a laptop stays on loopback unless HOST says otherwise.
        host=os.environ.get("HOST", "0.0.0.0" if BUNDLE.is_file() else "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        access_log=os.environ.get("NEARLY_ACCESS_LOG") == "1",
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
