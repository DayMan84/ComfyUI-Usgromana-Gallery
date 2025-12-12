# ComfyUI-Usgromana-Gallery/__init__.py
import os
import importlib
import traceback

# Tell ComfyUI where our frontend lives
APP_DIR = os.path.dirname(__file__)
WEB_DIRECTORY = os.path.join(APP_DIR, "web")
ASSETS_DIR = os.path.join(WEB_DIRECTORY, "assets")

# No Python nodes yet, just UI + API
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}


def _safe_import_backend_routes():
    """
    Import backend.routes, but never let it crash the whole extension.
    Any error will be printed instead of killing ComfyUI.
    """
    import json
    import time
    # #region agent log
    log_data = {"location": "__init__.py:16", "message": "Importing backend.routes", "data": {}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}
    try:
        with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
    except: pass
    # #endregion
    try:
        importlib.import_module(".backend.routes", __name__)
        print("[Usgromana-Gallery] backend.routes loaded.")
        # #region agent log
        log_data = {"location": "__init__.py:23", "message": "backend.routes loaded successfully", "data": {"route_prefix": "/usgromana-gallery"}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}
        try:
            with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
                f.write(json.dumps(log_data) + "\n")
        except: pass
        # #endregion
    except Exception as e:
        print("[Usgromana-Gallery] ERROR: failed to import backend.routes:", e)
        traceback.print_exc()
        # #region agent log
        log_data = {"location": "__init__.py:26", "message": "backend.routes import failed", "data": {"error": str(e)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}
        try:
            with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
                f.write(json.dumps(log_data) + "\n")
        except: pass
        # #endregion


_safe_import_backend_routes()

# Check if server.py is also loaded (ComfyUI might auto-load it)
# #region agent log
try:
    import sys
    if 'server' in sys.modules:
        log_data = {"location": "__init__.py:35", "message": "server module detected", "data": {"module": "server"}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}
        with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
except: pass
# #endregion
