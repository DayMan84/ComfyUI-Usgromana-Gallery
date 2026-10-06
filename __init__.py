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
    try:
        importlib.import_module(".backend.routes", __name__)
        print("[Usgromana-Gallery] backend.routes loaded.")
    except Exception as e:
        print("[Usgromana-Gallery] ERROR: failed to import backend.routes:", e)
        traceback.print_exc()


_safe_import_backend_routes()


def _safe_import_account_sharing():
    """Share routes live here and stay idle unless Usgromana is installed."""
    try:
        importlib.import_module(".backend.share_http", __name__)
    except Exception as e:
        print("[Usgromana-Gallery] ERROR: failed to import account sharing:", e)
        traceback.print_exc()


_safe_import_account_sharing()


def _safe_import_library_upload():
    """Accept images dropped onto the gallery and store them in the library."""
    try:
        importlib.import_module(".backend.uploads", __name__)
    except Exception as e:
        print("[Usgromana-Gallery] ERROR: failed to import image upload:", e)
        traceback.print_exc()


_safe_import_library_upload()


def _safe_import_social():
    """Comments, ratings, shares, and notifications keyed by image id."""
    try:
        importlib.import_module(".backend.social_http", __name__)
        importlib.import_module(".backend.notification_http", __name__)
    except Exception as e:
        print("[Usgromana-Gallery] ERROR: failed to import social gallery:", e)
        traceback.print_exc()


_safe_import_social()
