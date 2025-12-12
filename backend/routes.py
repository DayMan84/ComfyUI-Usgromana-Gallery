# ComfyUI-Usgromana-Gallery/backend/routes.py

import os
import json
import urllib.parse

from PIL import Image
from aiohttp import web
from server import PromptServer

from .files import get_output_dir, list_output_images
from .. import ASSETS_DIR  # from root __init__.py

# Use a unique prefix to avoid clashing with Usgromana RBAC
USGROMANA_GALLERY = "/usgromana-gallery"
ROUTE_PREFIX = USGROMANA_GALLERY

# --- Helpers ------------------------------------------------------


def _json(data: dict, status: int = 200) -> web.Response:
    return web.json_response(data, status=status)


def _safe_join_output(filename: str) -> str | None:
    """
    Safely join a filename to the output directory and ensure
    it cannot escape via .. or symlinks.
    """
    output_dir = os.path.abspath(get_output_dir())
    candidate = os.path.abspath(os.path.join(output_dir, filename))

    if not candidate.startswith(output_dir + os.sep) and candidate != output_dir:
        return None
    if not os.path.isfile(candidate):
        return None
    return candidate


def _apply_nsfw_filter(request: web.Request, images):
    """
    Hook to integrate the Usgromana NSFW checker.

    By default this does nothing and returns the list unchanged.

    You can plug your existing NSFW logic here, for example:

        from ..nsfw_guard import should_show_image, get_current_user

        user = get_current_user(request)
        return [
            img for img in images
            if should_show_image(user, _safe_join_output(img.relpath))
        ]

    Make sure guests and SFW-locked users are filtered here.
    """
    # TODO (Johnny): wire this to your real NSFW checker.
    return images


# --- Static assets (icons, logos, etc.) ---------------------------

# Serve files at: /usgromana-gallery/assets/<filename>
PromptServer.instance.app.router.add_static(
    f"{ROUTE_PREFIX}/assets",
    ASSETS_DIR,
    name="usgromana_gallery_assets",
)

# --- Image listing & serving --------------------------------------


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/list")
async def gallery_list(request: web.Request) -> web.Response:
    """
    Return basic info about images in the output directory, including
    recursive subfolders. Also returns a folder list for the UI.
    """
    try:
        images = list_output_images()

        # Apply NSFW filtering based on current user / SFW flag.
        images = _apply_nsfw_filter(request, images)

        base_url = f"{ROUTE_PREFIX}/image"
        payload_images = []

        # Build folder summary map
        folders_map: dict[str, dict] = {}

        for img in images:
            d = img.to_dict()
            # URL used by frontend to actually load the file
            d["url"] = f"{base_url}?filename={urllib.parse.quote(img.relpath)}"
            payload_images.append(d)

            folder = img.folder or ""
            if folder not in folders_map:
                folders_map[folder] = {
                    "path": folder,
                    "name": folder or "Output",
                    "count": 0,
                }
            folders_map[folder]["count"] += 1

        folder_list = sorted(
            folders_map.values(),
            key=lambda f: (0 if f["path"] == "" else 1, f["path"]),
        )

        return _json({"ok": True, "images": payload_images, "folders": folder_list})
    except Exception as e:
        # Don't blow up Comfy if something goes wrong
        return _json({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/image")
async def gallery_image(request: web.Request) -> web.StreamResponse:
    """
    Serve an image from the output directory.

    Optional query:
      - size=thumb   → return a cached thumbnail (max ~512px on the long side)
    """
    import json
    import time
    # #region agent log
    thumb_start = time.time()
    log_data = {"location": "routes.py:118", "message": "gallery_image request", "data": {"filename": request.query.get("filename"), "size": request.query.get("size")}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "G"}
    try:
        with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
    except: pass
    # #endregion
    filename = request.query.get("filename")
    if not filename:
        return _json({"ok": False, "error": "Missing filename"}, status=400)

    safe_path = _safe_join_output(filename)
    if safe_path is None:
        return _json({"ok": False, "error": "File not found or invalid path"}, status=404)

    size = request.query.get("size")
    if size == "thumb":
        # Thumbnails live under <output>/_thumbs/<filename>
        base_output = get_output_dir()
        thumbs_dir = os.path.join(base_output, "_thumbs")
        os.makedirs(thumbs_dir, exist_ok=True)

        # Avoid any directory tricks by only using basename
        thumb_name = os.path.basename(filename)
        thumb_path = os.path.join(thumbs_dir, thumb_name)

        try:
            # Rebuild thumb if missing or older than source
            needs_regen = (
                not os.path.isfile(thumb_path)
                or os.path.getmtime(thumb_path) < os.path.getmtime(safe_path)
            )

            if needs_regen:
                # #region agent log
                thumb_gen_start = time.time()
                log_data = {"location": "routes.py:152", "message": "Thumbnail generation start", "data": {"filename": filename}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "G"}
                try:
                    with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
                        f.write(json.dumps(log_data) + "\n")
                except: pass
                # #endregion
                with Image.open(safe_path) as im:
                    # Preserve aspect, cap the longest side
                    im.thumbnail((512, 512))
                    # Save as PNG regardless of original type
                    im.save(thumb_path, format="PNG")
                # #region agent log
                thumb_gen_duration = time.time() - thumb_gen_start
                log_data = {"location": "routes.py:158", "message": "Thumbnail generation complete", "data": {"filename": filename, "duration_ms": int(thumb_gen_duration * 1000)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "G"}
                try:
                    with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
                        f.write(json.dumps(log_data) + "\n")
                except: pass
                # #endregion

            # #region agent log
            thumb_duration = time.time() - thumb_start
            log_data = {"location": "routes.py:165", "message": "Thumbnail request complete", "data": {"filename": filename, "duration_ms": int(thumb_duration * 1000), "regenerated": needs_regen}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "G"}
            try:
                with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
                    f.write(json.dumps(log_data) + "\n")
            except: pass
            # #endregion
            return web.FileResponse(path=thumb_path)
        except Exception as e:
            # Fall back to full image if thumb generation fails
            print("[Usgromana-Gallery] Thumbnail error:", e)
            return web.FileResponse(path=safe_path)

    # Default: serve original full-size image
    return web.FileResponse(path=safe_path)

# --- Ratings persistence ------------------------------------------

RATINGS_FILE = os.path.join(get_output_dir(), "usgromana_gallery_ratings.json")


def _load_ratings() -> dict:
    try:
        if not os.path.isfile(RATINGS_FILE):
            return {}
        with open(RATINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def _save_ratings(data: dict) -> None:
    try:
        os.makedirs(os.path.dirname(RATINGS_FILE), exist_ok=True)
        with open(RATINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        # Don't crash Comfy if disk write fails
        pass


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/rating")
async def gallery_set_rating(request: web.Request) -> web.Response:
    """
    Persist a single rating: { "filename": "...", "rating": 1-5 }.
    """
    try:
        payload = await request.json()
    except Exception:
        return _json({"ok": False, "error": "Invalid JSON"}, status=400)

    filename = payload.get("filename")
    rating = payload.get("rating")

    if not filename or not isinstance(rating, (int, float)):
        return _json({"ok": False, "error": "Missing or invalid filename/rating"}, status=400)

    ratings = _load_ratings()
    ratings[filename] = int(rating)
    _save_ratings(ratings)

    return _json({"ok": True})


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/ratings")
async def gallery_get_ratings(request: web.Request) -> web.Response:
    """
    Return all stored ratings as { filename: rating, ... }.
    """
    ratings = _load_ratings()
    return web.json_response(ratings)


# --- Metadata persistence -----------------------------------------

META_FILE = os.path.join(get_output_dir(), "usgromana_gallery_meta.json")


def _load_meta() -> dict:
    if not os.path.exists(META_FILE):
        return {}
    try:
        with open(META_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_meta(meta: dict) -> None:
    tmp = META_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    os.replace(tmp, META_FILE)


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/meta")
async def gallery_get_meta(request: web.Request) -> web.Response:
    """
    Get stored metadata for a single image.
    Query: ?filename=<name>
    """
    filename = request.query.get("filename")
    if not filename:
        return _json({"ok": False, "error": "Missing filename"}, status=400)

    meta = _load_meta()
    return _json({"ok": True, "meta": meta.get(filename, {})})


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/meta")
async def gallery_set_meta(request: web.Request) -> web.Response:
    """
    Set stored metadata for a single image.
    Body: { "filename": "...", "meta": { ... } }
    """
    try:
        body = await request.json()
    except Exception:
        return _json({"ok": False, "error": "Invalid JSON"}, status=400)

    filename = body.get("filename")
    payload = body.get("meta") or {}

    if not filename:
        return _json({"ok": False, "error": "Missing filename"}, status=400)

    meta = _load_meta()
    meta[filename] = payload
    _save_meta(meta)

    return _json({"ok": True})


# --- Optional log endpoint ----------------------------------------


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/log")
async def gallery_log(request: web.Request) -> web.Response:
    """
    Optional logging endpoint for the web UI. Currently just discards logs.
    """
    try:
        _ = await request.json()
    except Exception:
        pass
    return _json({"ok": True})
